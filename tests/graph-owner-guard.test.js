const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const store = new Map();
let modal,
  errors = [];
global.wx = {
  getStorageSync: (k) => structuredClone(store.get(k) || ""),
  setStorageSync: (k, v) => store.set(k, structuredClone(v)),
  removeStorageSync: (k) => store.delete(k),
  showModal: (o) => (modal = o),
  showToast() {},
};
const local = require("../miniprogram/utils/local-data"),
  api = require("../miniprogram/utils/api"),
  graph = require("../miniprogram/utils/graph");
function seed() {
  store.clear();
  errors = [];
  for (const ownerId of ["graph-guard-a", "graph-guard-b"]) {
    local.migrate(ownerId, {
      ownerId,
      profile: { nickname: ownerId },
      contacts: [],
      relationships: [],
    });
    local.handle(ownerId, "/categories", "POST", { name: "虚构分类" });
  }
  store.set("ai-network-owner-id", "graph-guard-a");
}
function pageFor(request = api.request) {
  let p;
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../miniprogram/pages/graph/index.js"),
      "utf8",
    ),
    {
      Page: (v) => (p = v),
      require: (id) =>
        id.endsWith("/api")
          ? { request, showError: (e) => errors.push(e) }
          : graph,
      wx: global.wx,
      Error,
      setTimeout,
      clearTimeout,
    },
  );
  p.data = structuredClone(p.data);
  p.setData = (u) => Object.assign(p.data, u);
  p.cssW = 360;
  p.cssH = 640;
  return p;
}
const flush = () => new Promise((r) => setImmediate(r));
test("a category delete dialog cannot delete the next owners same-numbered category", async () => {
  seed();
  const p = pageFor();
  await p.loadAll();
  const id = p.categoryTree[0].id;
  p.deleteCategory({ currentTarget: { dataset: { id, name: "虚构分类" } } });
  store.set("ai-network-owner-id", "graph-guard-b");
  modal.success({ confirm: true });
  await flush();
  assert.equal(local.read("graph-guard-a").categoryTree.length, 1);
  assert.equal(local.read("graph-guard-b").categoryTree.length, 1);
  assert.ok(errors.length);
  assert.ok(p.data.loadError);
});
test("a rename dialog also loses authority when the account switches", async () => {
  seed();
  const p = pageFor();
  await p.loadAll();
  const id = p.categoryTree[0].id;
  const pending = p.renameCategory({ currentTarget: { dataset: { id } } });
  store.set("ai-network-owner-id", "graph-guard-b");
  modal.success({ confirm: true, content: "不能写入的名字" });
  await pending;
  await flush();
  assert.equal(local.read("graph-guard-b").categoryTree[0].name, "虚构分类");
  assert.equal(local.read("graph-guard-a").categoryTree[0].name, "虚构分类");
});
test("a failed reload after owner switch removes prior private graph data", async () => {
  seed();
  let reject = false;
  const p = pageFor((...args) =>
    reject
      ? Promise.reject(new Error("fixture read error"))
      : api.request(...args),
  );
  await p.loadAll();
  assert.equal(p.profile.ownerId, "graph-guard-a");
  store.set("ai-network-owner-id", "graph-guard-b");
  reject = true;
  await p.loadAll();
  assert.equal(p.profile, null);
  assert.equal(p.networkGraph, null);
  assert.equal(p.data.selected, null);
  assert.equal(p.data.profile.nickname, "自己");
});
test("an old owner response cannot populate a graph after the owner has changed", async () => {
  seed();
  let finish;
  const p = pageFor((route) =>
    route === "/contacts"
      ? new Promise((r) => (finish = r))
      : Promise.resolve(local.handle("graph-guard-a", route)),
  );
  const pending = p.loadAll();
  store.set("ai-network-owner-id", "graph-guard-b");
  finish([]);
  await pending;
  assert.equal(p.profile, null);
  assert.equal(p.networkGraph, null);
});
test("the local API rejects account switching in the async mutation boundary", async () => {
  seed();
  const id = local.read("graph-guard-a").categoryTree[0].id;
  const pending = api.request(`/categories/${id}`, "DELETE");
  store.set("ai-network-owner-id", "graph-guard-b");
  await assert.rejects(pending, /账号/);
  assert.equal(local.read("graph-guard-a").categoryTree.length, 1);
  assert.equal(local.read("graph-guard-b").categoryTree.length, 1);
});

test("a delayed graph search cannot publish matches from the previous owner", async () => {
  seed();
  local.handle("graph-guard-a", "/contacts", "POST", {
    name: "仅属于旧账号的联系人",
  });
  const p = pageFor();
  await p.loadAll();
  p.setData({ keyword: "旧账号" });
  store.set("ai-network-owner-id", "graph-guard-b");
  p.runSearch();
  assert.equal(p.data.searchResults.length, 0);
  assert.equal(p.profile, null);
});
