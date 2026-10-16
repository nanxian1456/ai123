const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const store = new Map();
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key)
};
const local = require("../miniprogram/utils/local-data");
const graph = require("../miniprogram/utils/graph");
const source = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/graph/index.js"), "utf8");
const flush = () => new Promise(resolve => setImmediate(resolve));
function pageFor(request, wx = {}) {
  let definition;
  vm.runInNewContext(source, {
    require: name => name.endsWith("/api") ? { request, showError: error => { throw error; } } : graph,
    Page: value => { definition = value; }, wx, setTimeout, clearTimeout
  });
  return { ...definition, data: structuredClone(definition.data), cssW: 360, cssH: 640,
    setData(updates) { Object.assign(this.data, updates); } };
}
function seed() {
  store.clear();
  const owner = "graph-page-owner";
  local.migrate(owner, { ownerId: owner, profile: { nickname: "本人" }, contacts: [{ id: 1, ownerId: owner, name: "旧姓名" }], relationships: [] });
  return owner;
}

test("graph refresh displays renamed contacts and categories even when counts do not change", async () => {
  const owner = seed();
  const category = local.handle(owner, "/categories", "POST", { name: "大学" });
  const page = pageFor(route => Promise.resolve(local.handle(owner, route)));
  page.loadAll(); await flush();
  assert.equal(page.networkGraph.nodeById.get("p1").label, "旧姓名");
  local.handle(owner, "/contacts/1", "PATCH", { name: "新姓名" });
  local.handle(owner, `/categories/${category.id}`, "PATCH", { name: "母校" });
  page.loadAll(); await flush();
  assert.equal(page.networkGraph.nodeById.get("p1").label, "新姓名");
  assert.equal(page.treeGraph.nodeById.get(category.id).label, "母校");
});

test("a hidden graph cannot restart its simulation when an outstanding load resolves", async () => {
  let finish;
  const owner = seed();
  const page = pageFor(route => route === "/contacts" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(local.handle(owner, route)));
  let frames = 0;
  page.canvas = { requestAnimationFrame() { frames++; } };
  page.data.mode = "network";
  page.loadAll(); page.onHide();
  finish(local.handle(owner, "/contacts")); await flush();
  assert.equal(frames, 0);
});

test("opening and closing graph drawers clears and restores the canvas", () => {
  const page = pageFor(() => Promise.resolve());
  let clears = 0, drawn = 0;
  page.ctx = { clearRect() { clears++; } };
  page.canvasReady = true;
  page.renderTree = () => { drawn++; };
  page.data.sheet = "branch";
  page.render();
  assert.equal(clears, 1);
  assert.equal(drawn, 0);
  page.closeSheet();
  assert.equal(drawn, 1);
});

test("confirming a unique contact search opens its category rather than the self drawer", async () => {
  const owner = seed();
  const category = local.handle(owner, "/categories", "POST", { name: "大学" });
  local.handle(owner, "/contacts/1", "PATCH", { name: "旧姓名", categoryIds: [category.id] });
  const page = pageFor(route => Promise.resolve(local.handle(owner, route)));
  await page.loadAll();
  page.data.keyword = "旧姓名";
  page.search();
  assert.equal(page.data.sheet, "branch");
  assert.equal(page.data.selected.name, "大学");
});

test("searching an unclassified contact opens the unclassified contact list", async () => {
  const owner = seed();
  const page = pageFor(route => Promise.resolve(local.handle(owner, route)));
  await page.loadAll();
  page.locateResult({ currentTarget: { dataset: { type: "contact", id: 1, catid: "", name: "旧姓名" } } });
  assert.equal(page.data.sheet, "branch");
  assert.equal(page.data.selected.name, "未分类");
  assert.equal(page.data.selected.contacts.length, 1);
});

test("adding from the unclassified branch does not send a synthetic category ID", () => {
  const urls = [];
  const page = pageFor(() => Promise.resolve(), { navigateTo: options => urls.push(options.url) });
  page.addContactToCategory({ currentTarget: { dataset: { id: "uncat" } } });
  assert.deepEqual(urls, ["/pages/contact-form/index"]);
});
