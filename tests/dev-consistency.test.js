const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const store = new Map();
const owner = "consistency-owner";
let geocodingFails = false;
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
  getSystemInfoSync: () => ({ platform: "devtools" }),
  createWorker: require("./helpers/crypto-worker"),
  getRandomValues: options => options.success({ randomValues: crypto.randomBytes(options.length) }),
  showToast() {},
  request(options) {
    if (geocodingFails) return options.fail({ errMsg: "offline" });
    const names = options.method === "POST" ? options.data.regions : [];
    const markers = names.map(name => ({ name, count: 99, latitude: 32, longitude: 118 }));
    markers.push({ name: "上海", count: 99, latitude: 31.2, longitude: 121.5 });
    options.success({ statusCode: 200, data: { center: { latitude: 32, longitude: 118 }, markers } });
  }
};
const local = require("../miniprogram/utils/local-data");
const api = require("../miniprogram/utils/api");
const backup = require("../miniprogram/utils/backup");

function seed(extra = {}) {
  store.clear(); geocodingFails = false;
  local.migrate(owner, { ownerId: owner, contacts: [], relationships: [], ...extra });
  store.set("ai-network-owner-id", owner);
  store.set("ai-network-auth-token", "consistency-test-token");
  store.set("ai-network-token-expires-at", Date.now() + 60000);
}
function pageFor(name, timers = {}) {
  let page;
  const directory = path.join(__dirname, `../miniprogram/pages/${name}`);
  const runtimeModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(directory, "index.js"), "utf8"), {
    module: runtimeModule, exports: runtimeModule.exports, Page(value) { page = value; },
    wx: global.wx, console, setTimeout: timers.setTimeout || setTimeout, clearTimeout: timers.clearTimeout || clearTimeout,
    require(id) {
      if (id === "threejs-miniprogram") return { createScopedThreejs() {} };
      return require(path.resolve(directory, id));
    }
  });
  page.data = structuredClone(page.data);
  page.setData = update => Object.assign(page.data, update);
  if (name === "graph") { page.cssW = 360; page.cssH = 640; }
  return page;
}
test("map distinguishes geocoding from a slow native map and recovers after its update event", async () => {
  seed(); addContact("甲", "南京");
  const callbacks = [];
  const page = pageFor("map", { setTimeout: fn => { callbacks.push(fn); return callbacks.length; }, clearTimeout() {} });
  page.setData({ level: "province", country: "中国" });
  const loading = page.load();
  assert.equal(page.data.coordinateLoading, true);
  await loading;
  assert.equal(page.data.coordinateLoading, false);
  assert.equal(page.data.mapWaiting, true);
  const generation = page.data.mapLoadId;
  callbacks.at(-1)();
  assert.equal(page.data.mapSlow, true);
  assert.equal(page.data.filteredRegions[0].count, 1);
  page.onMapUpdated({ currentTarget: { dataset: { loadId: generation } } });
  assert.equal(page.data.mapSlow, false);
  assert.equal(page.data.mapWaiting, false);
});
test("map retry and leaving the page ignore stale slow-map timers and native events", async () => {
  seed(); addContact("甲", "南京");
  const callbacks = [];
  const page = pageFor("map", { setTimeout: fn => { callbacks.push(fn); return callbacks.length; }, clearTimeout() {} });
  page.setData({ level: "province", country: "中国" });
  await page.load();
  const old = page.data.mapLoadId, oldTimer = callbacks.at(-1);
  await page.retryMap();
  oldTimer();
  page.onMapUpdated({ currentTarget: { dataset: { loadId: old } } });
  assert.equal(page.data.mapWaiting, true);
  assert.equal(page.data.mapSlow, false);
  page.onHide(); callbacks.at(-1)();
  assert.equal(page.data.mapWaiting, false);
  assert.equal(page.data.mapSlow, false);
});
test("contacts category entry opens the loaded graph manager without changing data", async () => {
  seed();
  const category = await api.request('/categories', 'POST', { name: '同学' });
  addContact('甲', '南京', { categoryIds: [category.id], tags: ['合作'] });
  let switched;
  wx.switchTab = options => { switched = options.url; };
  const before = local.read(owner);
  const contacts = pageFor('contacts');
  contacts.manageCategories();
  assert.equal(switched, '/pages/graph/index');
  const graph = pageFor('graph'); graph.canvasReady = true;
  graph.setData({ mode: 'network' });
  await graph.onShow();
  assert.equal(graph.data.mode, 'tree');
  assert.equal(graph.data.sheet, 'manage');
  assert.equal(graph.data.manageCategories[0].name, '同学');
  graph.closeSheet(); await graph.onShow();
  assert.equal(graph.data.sheet, '');
  assert.deepEqual(local.read(owner), before);
});
test("category entry cannot carry over to a different account", async () => {
  seed(); wx.switchTab = () => {};
  pageFor('contacts').manageCategories();
  store.set('ai-network-owner-id', 'another-owner');
  local.migrate('another-owner', { ownerId: 'another-owner', contacts: [], relationships: [] });
  const graph = pageFor('graph'); graph.canvasReady = true;
  await graph.onShow();
  assert.equal(graph.data.sheet, '');
});
test("contacts list has a loading state and clears it after real local reads", async () => {
  seed(); addContact('甲', '南京');
  const page = pageFor('contacts');
  const loading = page.loadContacts();
  assert.equal(page.data.loading, true);
  await loading;
  assert.equal(page.data.loading, false);
  assert.equal(page.contactList[0].name, '甲');
});
test("real form save, tag filter and category manager agree with the restored backup", async () => {
  seed(); wx.navigateBack = () => {}; wx.setNavigationBarTitle = () => {};
  const category = await api.request('/categories', 'POST', { name: '开发组' });
  const form = pageFor('contact-form', { setTimeout: fn => { fn(); return 1; } });
  form.setData({ form: { ...form.data.form, name: '流程测试甲', country: '中国', province: '江苏', city: '南京', tagsText: '合作' }, categoryIds: [category.id] });
  await form.loadCategories();
  await form.save(); await form.save();
  const contacts = pageFor('contacts');
  contacts.setData({ selectedTag: '合作' }); await contacts.loadContacts();
  assert.equal(contacts.contactList.length, 1, 'repeated save cannot create a second contact');
  const saved = contacts.contactList[0];
  const graph = pageFor('graph'); await graph.loadAll(); graph.openManage();
  assert.equal(graph.data.manageCategories[0].contactCount, 1);
  const encrypted = await backup.create(owner, 'flow-test-password');
  await api.request(`/contacts/${saved.id}`, 'DELETE');
  await backup.restore(owner, await backup.openAsync(encrypted, 'flow-test-password', owner));
  await contacts.loadContacts(); await graph.loadAll();
  assert.equal(contacts.contactList[0].name, '流程测试甲');
  assert.equal(graph.getBranchContacts(category.id)[0].name, '流程测试甲');
  assert.equal(graph.data.manageCategories[0].contactCount, 1);
});
function addContact(name, city, extra = {}) {
  return local.handle(owner, "/contacts", "POST", {
    name, country: "中国", province: "江苏", city, ...extra
  });
}

test("map region markers use local counts and refresh after moving or deleting a contact", async () => {
  seed();
  const alice = addContact("甲", "南京");
  addContact("乙", "苏州");
  const page = pageFor("map");
  page.setData({ level: "province", country: "中国" });
  await page.load();
  assert.deepEqual(Array.from(page.data.markers, marker => marker.title), ["江苏 2人"]);
  page.setData({ level: "city", province: "江苏" });
  await page.load();
  assert.deepEqual(Array.from(page.data.markers, marker => marker.title).sort(), ["南京 1人", "苏州 1人"]);
  local.handle(owner, `/contacts/${alice.id}`, "PATCH", { name: "甲改名", country: "中国", province: "江苏", city: "苏州" });
  await page.load();
  assert.deepEqual(Array.from(page.data.markers, marker => marker.title), ["苏州 2人"]);
  local.handle(owner, `/contacts/${alice.id}`, "DELETE");
  await page.load();
  assert.deepEqual(Array.from(page.data.markers, marker => marker.title), ["苏州 1人"]);
});

test("saved contact coordinates remain visible when the location service is unavailable", async () => {
  seed();
  addContact("甲", "南京", { latitude: 32.1, longitude: 118.9 });
  geocodingFails = true;
  const page = pageFor("map");
  page.setData({ level: "city", country: "中国", province: "江苏", city: "南京", citySelected: true });
  await page.load();
  assert.equal(page.data.filteredContacts.length, 1);
  assert.equal(page.data.markers[0]?.latitude, 32.1);
  assert.equal(page.data.markers[0]?.longitude, 118.9);
  // The city centre comes from the offline table, so no lookup is needed.
  assert.deepEqual(page.data.center, { latitude: 32.06, longitude: 118.8 });
  assert.equal(page.data.mapError, "");
});

test("an explicitly unspecified country or city does not include contacts from other regions", async () => {
  seed();
  addContact("国内", "南京");
  // A recognisable mainland place fills in the country, so the unspecified case uses an unknown place.
  addContact("未设国家", "某镇", { country: "", province: "某州" });
  addContact("推断国家", "南京", { country: "" });
  addContact("未设城市", "", { province: "" });
  const unknownCountry = await api.request("/contacts/directory?country=&province=" + encodeURIComponent("某州") + "&city=" + encodeURIComponent("某镇"));
  assert.deepEqual(unknownCountry.map(contact => contact.name), ["未设国家"]);
  const inferred = await api.request("/contacts/directory?country=" + encodeURIComponent("中国") + "&province=" + encodeURIComponent("江苏") + "&city=" + encodeURIComponent("南京"));
  assert.deepEqual(inferred.map(contact => contact.name).sort(), ["国内", "推断国家"].sort());
  const unknownCity = await api.request("/contacts/directory?country=" + encodeURIComponent("中国") + "&province=&city=");
  assert.deepEqual(unknownCity.map(contact => contact.name), ["未设城市"]);
  assert.equal((await api.request("/contacts/directory?keyword=")).length, 4);
});

test("a historical category tree beyond the new creation limit can be backed up and restored intact", async () => {
  let tree = [];
  for (let id = 17; id >= 1; id--) tree = [{ id: `cat${id}`, name: `分类${id}`, children: tree }];
  seed({ categoryTree: tree, nextCategoryId: 18 });
  addContact("甲", "南京", { categoryIds: ["cat17"] });
  const encrypted = await backup.create(owner, "consistency-password");
  const opened = await backup.openAsync(encrypted, "consistency-password", owner);
  local.handle(owner, "/categories/cat1", "DELETE");
  await backup.restore(owner, opened);
  assert.deepEqual(local.read(owner).categoryTree, tree);
  assert.deepEqual(local.handle(owner, "/contacts")[0].categoryIds, ["cat17"]);
  assert.throws(() => local.handle(owner, "/categories", "POST", { name: "过深", parentId: "cat17" }), /16/);
});

test("legacy category repair is consistent across graph reads, contacts and encrypted backup", async () => {
  seed();
  const legacy = local.read(owner);
  legacy.categoryTree = [{ id: "legacy", name: " 大学 " }];
  legacy.nextCategoryId = 1;
  legacy.contacts = [{ id: 1, ownerId: owner, name: "甲", categoryIds: ["legacy"] }];
  legacy.nextContactId = 2;
  store.set(local.key(owner), legacy);
  const tree = (await api.request("/categories")).tree;
  assert.deepEqual((await api.request("/contacts"))[0].categoryIds, [tree[0].id]);
  const encrypted = await backup.create(owner, "consistency-password");
  const opened = await backup.openAsync(encrypted, "consistency-password", owner);
  assert.deepEqual(opened.data.contacts[0].categoryIds, [tree[0].id]);
  assert.equal(opened.data.categoryTree[0].name, "大学");
  assert.deepEqual(store.get(local.key(owner)), legacy, "reading and exporting must not overwrite the original data");
});

test("returning to an open graph branch refreshes renamed contacts and closes a deleted category", async () => {
  seed();
  const category = await api.request("/categories", "POST", { name: "大学" });
  const contact = addContact("旧姓名", "南京", { categoryIds: [category.id] });
  const page = pageFor("graph");
  await page.loadAll();
  page.selectBranch(page.treeGraph.nodeById.get(category.id));
  await api.request(`/contacts/${contact.id}`, "PATCH", { name: "新姓名", city: "南京" });
  await page.loadAll();
  assert.equal(page.data.selected.contacts[0].name, "新姓名");
  await api.request(`/categories/${category.id}`, "DELETE");
  await page.loadAll();
  assert.equal(page.data.sheet, "");
  assert.equal((await api.request("/contacts")).length, 1);
});

test("the graph self summary refreshes after adding a contact on another page", async () => {
  seed();
  addContact("甲", "南京");
  const page = pageFor("graph");
  await page.loadAll();
  page.selectSelf();
  addContact("乙", "苏州");
  await page.loadAll();
  assert.equal(page.data.selected.contactCount, 2);
});

test("refreshing an open network contact preserves its actual relationship count", async () => {
  seed();
  const alice = addContact("甲", "南京");
  const bob = addContact("乙", "南京");
  await api.request("/relationships", "POST", { sourceId: alice.id, targetId: bob.id, type: "合作" });
  const page = pageFor("graph");
  page.setData({ mode: "network" });
  await page.loadAll();
  page.selectNode(`p${alice.id}`);
  await api.request(`/contacts/${alice.id}`, "PATCH", { name: "新姓名", city: "南京" });
  await page.loadAll();
  assert.equal(page.data.selected.label, "新姓名");
  assert.equal(page.data.selected.degree, 2);
});

test("a map hidden during a location lookup cannot be changed by the late response", async () => {
  seed();
  // A place missing from the offline table, so its coordinates are looked up.
  addContact("甲", "圣胡安", { country: "美国", province: "波多黎各" });
  const previousRequest = wx.request;
  let finish;
  wx.request = options => { finish = () => options.success({ statusCode: 200,
    data: { center: { latitude: 38, longitude: -97 }, markers: [{ name: "波多黎各", latitude: 18.2, longitude: -66.5 }] } }); };
  try {
    const page = pageFor("map");
    page.setData({ level: "province", country: "美国" });
    const pending = page.load();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof finish, "function");
    page.onHide();
    finish();
    await pending;
    assert.equal(page.data.center, null);
    assert.equal(page.data.markers.length, 0);
  } finally { wx.request = previousRequest; }
});

test("contacts, relationships, graph and map agree after editing, encrypted backup and restoration", async () => {
  seed();
  const category = await api.request("/categories", "POST", { name: "同事" });
  const alice = addContact("甲", "南京", { categoryIds: [category.id], latitude: 32.1, longitude: 118.9 });
  const bob = addContact("乙", "苏州");
  await api.request("/relationships", "POST", { sourceId: alice.id, targetId: bob.id, type: "合作", note: "测试项目" });
  const graph = pageFor("graph");
  const detail = pageFor("contact-detail");
  const map = pageFor("map");
  await detail.loadContact(String(alice.id));
  assert.equal(detail.data.relationships[0].other.name, "乙");
  await api.request(`/contacts/${bob.id}`, "PATCH", { name: "乙改名", country: "中国", province: "江苏", city: "南京" });
  await graph.loadAll();
  await detail.loadContact(String(alice.id));
  assert.equal(graph.networkGraph.nodeById.get(`p${bob.id}`).label, "乙改名");
  assert.equal(detail.data.relationships[0].other.name, "乙改名");
  map.setData({ level: "city", country: "中国", province: "江苏" });
  await map.load();
  assert.deepEqual(Array.from(map.data.markers, marker => marker.title), ["南京 2人"]);
  const encrypted = await backup.create(owner, "consistency-password");
  const opened = await backup.openAsync(encrypted, "consistency-password", owner);
  await api.request(`/contacts/${bob.id}`, "DELETE");
  await graph.loadAll();
  assert.equal(graph.relationships.length, 0);
  await backup.restore(owner, opened);
  await graph.loadAll();
  await detail.loadContact(String(alice.id));
  await map.load();
  assert.equal(graph.contacts.length, 2);
  assert.equal(graph.relationships.length, 1);
  assert.equal(detail.data.relationships[0].other.name, "乙改名");
  assert.equal(graph.getBranchContacts(category.id)[0].name, "甲");
  assert.deepEqual(Array.from(map.data.markers, marker => marker.title), ["南京 2人"]);
  assert.equal((await api.request("/contacts/directory?city=" + encodeURIComponent("南京"))).length, 2);
});
