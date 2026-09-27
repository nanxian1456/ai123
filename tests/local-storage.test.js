const assert = require("node:assert/strict");
const test = require("node:test");

const store = new Map();
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key)
};
const local = require("../miniprogram/utils/local-data");
const api = require("../miniprogram/utils/api");
const blank = ownerId => ({ ownerId, profile: null, contacts: [], relationships: [] });

test("migration keeps old IDs and separates each account", () => {
  store.clear();
  local.migrate("one", { ...blank("one"), contacts: [{ id: 7, ownerId: "one", name: "张三", city: "南京", tags: ["校友"] }], relationships: [] });
  local.migrate("two", blank("two"));
  assert.equal(local.handle("one", "/contacts").length, 1);
  assert.equal(local.handle("two", "/contacts").length, 0);
  assert.equal(local.handle("one", "/contacts", "POST", { name: "李四" }).id, 8);
  assert.equal(local.handle("two", "/contacts", "POST", { name: "王五" }).id, 1);
  assert.equal(local.handle("one", "/contacts/directory?keyword=%E5%BC%A0")[0].initial, "Z");
  assert.equal(local.handle("one", "/dashboard").contactCount, 2);
});

test("relationship deletion follows contact deletion", () => {
  store.clear();
  local.migrate("one", blank("one"));
  const first = local.handle("one", "/contacts", "POST", { name: "张三" });
  const second = local.handle("one", "/contacts", "POST", { name: "李四" });
  local.handle("one", "/relationships", "POST", { sourceId: first.id, targetId: second.id, type: "合作" });
  assert.equal(local.handle("one", `/graphs/contacts/${first.id}`).edges.length, 1);
  local.handle("one", `/contacts/${second.id}`, "DELETE");
  assert.equal(local.handle("one", `/graphs/contacts/${first.id}`).edges.length, 0);
});

test("failed migration never creates empty local data", async () => {
  store.clear();
  store.set("ai-network-auth-token", "old-token");
  wx.request = options => options.fail();
  await assert.rejects(api.validateSession(), /无法连接后端/);
  assert.equal([...store.keys()].filter(key => key.startsWith("ai-network-local-v1:")).length, 0);
  assert.equal(api.getStoredToken(), "old-token");
});

test("expired legacy token returns to login without erasing local records", async () => {
  store.clear();
  local.migrate("one", blank("one"));
  store.set("ai-network-auth-token", "expired-token");
  wx.request = options => options.success({ statusCode: 401, data: {} });
  await assert.rejects(api.validateSession(), /SESSION_INVALID/);
  assert.ok(local.read("one"));
});

test("local requests do not contact the server and logout preserves records", async () => {
  store.clear();
  local.migrate("one", blank("one"));
  store.set("ai-network-auth-token", "token");
  store.set("ai-network-owner-id", "one");
  wx.request = () => { throw new Error("unexpected network request"); };
  await api.request("/me", "PATCH", { nickname: "本机用户" });
  await api.request("/contacts", "POST", { name: "张三" });
  assert.equal((await api.validateSession()).nickname, "本机用户");
  api.clearSession();
  assert.equal(local.handle("one", "/contacts").length, 1);
  await assert.rejects(api.validateSession(), /NO_SESSION/);
});

test("invalid changes do not replace stored records", () => {
  store.clear();
  local.migrate("one", blank("one"));
  assert.throws(() => local.handle("one", "/contacts", "POST", { name: " ", id: 100 }), /姓名不能为空/);
  assert.equal(local.handle("one", "/contacts").length, 0);
  assert.throws(() => local.migrate("two", { ...blank("one") }), /旧数据格式/);
  assert.equal(local.read("two"), null);
});
