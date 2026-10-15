const assert = require("node:assert/strict");
const test = require("node:test");
const store = new Map();
let failWrites = false;
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => { if (failWrites) throw new Error("quota"); store.set(key, structuredClone(value)); },
  removeStorageSync: key => store.delete(key)
};
const local = require("../miniprogram/utils/local-data");
const backup = require("../miniprogram/utils/backup");
const api = require("../miniprogram/utils/api");
function seed(owner = "graph-owner") {
  store.clear(); failWrites = false;
  local.migrate(owner, { ownerId: owner, contacts: [{ id: 1, ownerId: owner, name: "原有联系人" }], relationships: [] });
  return owner;
}

test("the graph reads existing contacts and raw relationships without changing stored data", () => {
  const owner = seed();
  const before = structuredClone([...store]);
  assert.deepEqual(local.handle(owner, "/relationships"), []);
  const result = local.handle(owner, "/categories");
  assert.deepEqual(result.tree, []);
  assert.ok(result.recommended.includes("大学"));
  assert.deepEqual([...store], before);
  assert.equal(local.handle(owner, "/contacts")[0].name, "原有联系人");
});

test("graph classification and relationship requests work offline through the existing API", async () => {
  const owner = seed();
  store.set("ai-network-owner-id", owner);
  wx.request = () => { throw new Error("Graph data must stay local"); };
  const created = await api.request("/categories", "POST", { name: "大学" });
  const result = await api.request("/categories");
  assert.equal(result.tree[0].id, created.id);
  assert.deepEqual(await api.request("/relationships"), []);
});

test("nested classification, rename and deletion preserve contacts and unrelated classifications", () => {
  const owner = seed();
  const parent = local.handle(owner, "/categories", "POST", { name: "大学" });
  const child = local.handle(owner, "/categories", "POST", { name: "同学", parentId: parent.id });
  const other = local.handle(owner, "/categories", "POST", { name: "朋友" });
  local.handle(owner, "/contacts/1", "PATCH", { name: "原有联系人", categoryIds: [child.id, other.id] });
  local.handle(owner, `/categories/${parent.id}`, "PATCH", { name: "母校" });
  assert.equal(local.handle(owner, "/categories").tree[0].name, "母校");
  local.handle(owner, `/categories/${parent.id}`, "DELETE");
  assert.deepEqual(local.handle(owner, "/contacts/1").categoryIds, [other.id]);
  assert.equal(local.handle(owner, "/contacts").length, 1);
});

test("recommended categories can be hidden and restored independently for each account", () => {
  const owner = seed();
  local.migrate("other", { ownerId: "other", contacts: [], relationships: [] });
  local.handle(owner, "/categories/dismiss", "POST", { name: "邻居" });
  assert.ok(!local.handle(owner, "/categories").recommended.includes("邻居"));
  assert.ok(local.handle("other", "/categories").recommended.includes("邻居"));
  local.handle(owner, "/categories/restore", "POST", { name: "邻居" });
  assert.ok(local.handle(owner, "/categories").recommended.includes("邻居"));
});

test("failed category saves and invalid contact classifications preserve the original records", () => {
  const owner = seed();
  const before = local.read(owner);
  failWrites = true;
  assert.throws(() => local.handle(owner, "/categories", "POST", { name: "大学" }), /存储/);
  failWrites = false;
  assert.deepEqual(local.read(owner), before);
  assert.throws(() => local.handle(owner, "/contacts/1", "PATCH", { name: "新名字", categoryIds: ["cat999"] }), /分类/);
  assert.deepEqual(local.read(owner), before);
});

test("classification survives contact edits that do not include categoryIds", () => {
  const owner = seed();
  const category = local.handle(owner, "/categories", "POST", { name: "同事" });
  local.handle(owner, "/contacts/1", "PATCH", { name: "原有联系人", categoryIds: [category.id] });
  local.handle(owner, "/contacts/1", "PATCH", { name: "改名后" });
  assert.deepEqual(local.handle(owner, "/contacts/1").categoryIds, [category.id]);
});

test("backup restoration preserves category trees, contact membership and hidden recommendations", async () => {
  const owner = seed();
  const category = local.handle(owner, "/categories", "POST", { name: "大学" });
  local.handle(owner, "/contacts/1", "PATCH", { name: "原有联系人", categoryIds: [category.id] });
  local.handle(owner, "/categories/dismiss", "POST", { name: "邻居" });
  const snapshot = local.read(owner);
  local.handle(owner, `/categories/${category.id}`, "DELETE");
  await backup.restore(owner, { data: snapshot, avatar: "" });
  assert.deepEqual(local.read(owner).categoryTree, snapshot.categoryTree);
  assert.deepEqual(local.read(owner).contacts[0].categoryIds, [category.id]);
  assert.deepEqual(local.read(owner).dismissedCategories, ["邻居"]);
});

test("malformed classification backups fail before replacing local data", async () => {
  const owner = seed();
  const before = local.read(owner);
  const invalid = { ...before, categoryTree: [{ id: "cat1", name: "大学", children: [{ id: "cat1", name: "重复编号", children: [] }] }], nextCategoryId: 2 };
  await assert.rejects(backup.restore(owner, { data: invalid, avatar: "" }), /分类/);
  assert.deepEqual(local.read(owner), before);
});
