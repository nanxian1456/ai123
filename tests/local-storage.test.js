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
  assert.equal(local.handle("one", `/contacts/${first.id}/relationships`).length, 1);
  local.handle("one", `/contacts/${second.id}`, "DELETE");
  assert.equal(local.handle("one", `/contacts/${first.id}/relationships`).length, 0);
});

test("custom tag catalog stays local per account before assignment", () => {
  store.clear();
  local.migrate("one", blank("one"));
  local.migrate("two", blank("two"));
  assert.deepEqual(local.handle("one", "/tags", "POST", { name: " 南京大学计算机学院 " }), { name: "南京大学计算机学院", count: 0 });
  assert.equal(local.handle("one", "/tags")[0].count, 0);
  assert.equal(local.handle("two", "/tags").length, 0);
  assert.throws(() => local.handle("one", "/tags", "POST", { name: "南京大学计算机学院" }), /已存在/);
  const contact = local.handle("one", "/contacts", "POST", { name: "王老师", tags: ["南京大学计算机学院"] });
  assert.equal(local.handle("one", "/tags")[0].count, 1);
  local.handle("one", `/contacts/${contact.id}`, "DELETE");
  assert.equal(local.handle("one", "/tags")[0].count, 0);
  assert.deepEqual(local.read("one").tagCatalog, ["南京大学计算机学院"]);
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
  await assert.rejects(api.validateSession(), error => error.code === "SESSION_INVALID" && /登录已过期/.test(error.message));
  assert.ok(local.read("one"));
});

test("private profile and contacts stay local", async () => {
  store.clear();
  local.migrate("one", blank("one"));
  store.set("ai-network-auth-token", "token");
  store.set("ai-network-owner-id", "one");
  const requests = [];
  wx.request = options => { requests.push(options); options.success({ statusCode: 200, data: {} }); };
  await api.request("/me", "PATCH", { nickname: "本机用户" });
  assert.equal(requests.length, 0);
  await api.request("/contacts", "POST", { name: "张三" });
  assert.equal(requests.length, 0);
  assert.equal((await api.validateSession()).nickname, "本机用户");
  api.clearSession();
  assert.equal(local.handle("one", "/contacts").length, 1);
  await assert.rejects(api.validateSession(), /NO_SESSION/);
});

test("publishing shares only selected profile fields and revoking removes access", async () => {
  store.clear();
  local.migrate("one", blank("one"));
  local.handle("one", "/me", "PATCH", { nickname: "小王", organization: "大学", city: "南京" });
  store.set("ai-network-auth-token", "token");
  store.set("ai-network-owner-id", "one");
  const sent = [];
  wx.request = options => { sent.push(options.data); options.success({ statusCode: 200, data: {} }); };
  await api.request("/me/visibility", "PATCH", { avatar: false, nickname: true, organization: false, position: false, city: true, bio: false });
  assert.deepEqual(sent[0], { published: true, nickname: "小王", organization: "", position: "", city: "南京", bio: "" });
  await api.request("/me/visibility", "PATCH", { avatar: false, nickname: false, organization: false, position: false, city: false, bio: false });
  assert.equal(sent[1].published, false);
});

test("lost publication response preserves desired visibility and marks outcome pending", async () => {
  store.clear();
  local.migrate("one", blank("one"));
  local.handle("one", "/me", "PATCH", { nickname: "小王", organization: "学校" });
  store.set("ai-network-auth-token", "token");
  store.set("ai-network-owner-id", "one");
  wx.request = options => options.fail();
  await assert.rejects(api.request("/me/visibility", "PATCH", { avatar: false, nickname: true, organization: false, position: false, city: false, bio: false }), /无法连接后端/);
  assert.equal(local.handle("one", "/me").visibility.nickname, true);
  assert.equal(local.handle("one", "/me").publicationStatus, "pending");
});

test("publication rejection never erases contacts written while request is pending", async () => {
  store.clear(); local.migrate("one", blank("one"));
  local.handle("one", "/me", "PATCH", { nickname: "小王" });
  store.set("ai-network-auth-token", "token"); store.set("ai-network-owner-id", "one");
  let pending;
  wx.request = options => { pending = options; };
  const publishing = api.request("/me/visibility", "PATCH", { avatar: false, nickname: true, organization: false, position: false, city: false, bio: false });
  await new Promise(resolve => setImmediate(resolve));
  local.handle("one", "/contacts", "POST", { name: "新联系人" });
  pending.success({ statusCode: 400, data: { message: "公开资料无效", fieldErrors: { nickname: "昵称无效" } } });
  await assert.rejects(publishing, /公开资料无效.*昵称无效/);
  assert.equal(local.handle("one", "/contacts")[0].name, "新联系人");
  assert.equal(local.handle("one", "/me").visibility.nickname, false);
});

test("queued profile edits survive an earlier rejection and preserve a newer avatar", async () => {
  store.clear(); local.migrate("one", blank("one"));
  local.handle("one", "/me", "PATCH", { nickname: "原名" });
  local.handle("one", "/me/visibility", "PATCH", { avatar: false, nickname: true, organization: false, position: false, city: false, bio: false });
  store.set("ai-network-auth-token", "token"); store.set("ai-network-owner-id", "one");
  const requests = [];
  wx.request = options => requests.push(options);
  const first = api.request("/me", "PATCH", { nickname: "失败修改" });
  const rejected = assert.rejects(first, /拒绝/);
  const second = api.request("/me", "PATCH", { nickname: "最新修改" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1);
  const current = local.read("one"); current.profile.avatarUrl = "/new-avatar"; local.write("one", current);
  requests[0].success({ statusCode: 400, data: { message: "拒绝" } });
  await rejected;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  requests[1].success({ statusCode: 200, data: {} });
  await second;
  assert.equal(local.read("one").profile.nickname, "最新修改");
  assert.equal(local.read("one").profile.avatarUrl, "/new-avatar");
});

test("lost privacy revocation response can be reconciled by idempotent retry", async () => {
  store.clear(); local.migrate("one", blank("one"));
  local.handle("one", "/me", "PATCH", { nickname: "原名" });
  local.handle("one", "/me/visibility", "PATCH", { avatar: false, nickname: true, organization: false, position: false, city: false, bio: false });
  store.set("ai-network-auth-token", "token"); store.set("ai-network-owner-id", "one");
  wx.request = options => options.fail();
  await assert.rejects(api.request("/me/visibility", "PATCH", { avatar: false, nickname: false, organization: false, position: false, city: false, bio: false }), /尚未确认/);
  assert.equal(local.read("one").profile.publicationStatus, "pending");
  let sent;
  wx.request = options => { sent = options.data; options.success({ statusCode: 200, data: {} }); };
  await api.syncPublishedProfile(local.read("one").profile);
  assert.equal(sent.published, false);
  assert.equal(local.read("one").profile.publicationStatus, "synced");
});

test("sync never marks a concurrently replaced public profile as confirmed", async () => {
  store.clear(); local.migrate("one", blank("one"));
  local.handle("one", "/me", "PATCH", { nickname: "旧名字" });
  local.handle("one", "/me/visibility", "PATCH", { avatar: false, nickname: true, organization: false, position: false, city: false, bio: false });
  store.set("ai-network-auth-token", "token"); store.set("ai-network-owner-id", "one");
  let pending; wx.request = options => { pending = options; };
  const syncing = api.syncPublishedProfile(local.read("one").profile);
  await new Promise(resolve => setImmediate(resolve));
  local.handle("one", "/me", "PATCH", { nickname: "恢复的新名字" });
  pending.success({ statusCode: 200, data: {} });
  await assert.rejects(syncing, /已变化.*重新同步/);
  assert.equal(local.read("one").profile.publicationStatus, "pending");
});

test("successful publication followed by local status write failure never rolls back desired privacy", async () => {
  store.clear(); local.migrate("one", blank("one"));
  local.handle("one", "/me", "PATCH", { nickname: "原名" });
  store.set("ai-network-auth-token", "token"); store.set("ai-network-owner-id", "one");
  wx.request = options => options.success({ statusCode: 200, data: {} });
  const save = wx.setStorageSync;
  wx.setStorageSync = (key, value) => {
    if ((value.profile && value.profile.publicationStatus === "synced") || (typeof value === "string" && value.includes('"publicationStatus":"synced"'))) throw new Error("quota");
    save(key, value);
  };
  try {
    await assert.rejects(api.request("/me/visibility", "PATCH", { avatar: false, nickname: true, organization: false, position: false, city: false, bio: false }), /尚未确认/);
    assert.equal(local.read("one").profile.visibility.nickname, true);
    assert.equal(local.read("one").profile.publicationStatus, "pending");
  } finally { wx.setStorageSync = save; }
});

test("every local read failure after server acknowledgement retains desired publication", async () => {
  const read = wx.getStorageSync;
  for (const failAt of [1, 2, 3]) {
    store.clear(); local.migrate("one", blank("one"));
    local.handle("one", "/me", "PATCH", { nickname: "用户" });
    store.set("ai-network-auth-token", "token"); store.set("ai-network-owner-id", "one");
    let acknowledged = false;
    let readsAfterAck = 0;
    wx.request = options => { acknowledged = true; options.success({ statusCode: 200, data: {} }); };
    wx.getStorageSync = key => {
      if (acknowledged && key === local.key("one") && ++readsAfterAck === failAt) throw new Error("一次读取失败");
      return read(key);
    };
    try {
      await assert.rejects(api.request("/me/visibility", "PATCH", { avatar: false, nickname: true, organization: false, position: false, city: false, bio: false }), error => error.ambiguous === true && /尚未确认/.test(error.message));
      assert.equal(local.read("one").profile.visibility.nickname, true);
      assert.equal(local.read("one").profile.publicationStatus, "pending");
    } finally { wx.getStorageSync = read; }
  }
});

test("acknowledged retry keeps ambiguous errors even when local status cannot be reread", async () => {
  store.clear(); local.migrate("one", blank("one"));
  local.handle("one", "/me", "PATCH", { nickname: "用户" });
  local.handle("one", "/me/visibility", "PATCH", { avatar: false, nickname: true, organization: false, position: false, city: false, bio: false });
  store.set("ai-network-auth-token", "token"); store.set("ai-network-owner-id", "one");
  const profile = local.read("one").profile;
  const read = wx.getStorageSync;
  let acknowledged = false;
  wx.request = options => { acknowledged = true; options.success({ statusCode: 200, data: {} }); };
  wx.getStorageSync = key => {
    if (acknowledged && key === local.key("one")) throw new Error("持续读取失败");
    return read(key);
  };
  try { await assert.rejects(api.syncPublishedProfile(profile), error => error.ambiguous === true && /尚未确认/.test(error.message)); }
  finally { wx.getStorageSync = read; }
  assert.equal(local.read("one").profile.visibility.nickname, true);
  assert.equal(local.read("one").profile.publicationStatus, "pending");
});

test("expired session permits cached local requests but remote 401 has actionable error", async () => {
  store.clear(); local.migrate("one", blank("one"));
  store.set("ai-network-auth-token", "token"); store.set("ai-network-owner-id", "one");
  store.set("ai-network-token-expires-at", Date.now() - 1);
  wx.login = options => options.fail();
  assert.deepEqual(await api.request("/contacts"), []);
  store.set("ai-network-token-expires-at", Date.now() + 10000);
  wx.request = options => options.success({ statusCode: 401, data: {} });
  await assert.rejects(api.request("/ai/extract", "POST", {}), /登录已过期.*重新登录/);
  assert.equal(api.getStoredToken(), "");
  assert.deepEqual(await api.request("/contacts"), []);
});

test("identical relations and oversized storage writes fail without mutation", () => {
  store.clear(); local.migrate("one", blank("one"));
  const a = local.handle("one", "/contacts", "POST", { name: "甲" });
  const b = local.handle("one", "/contacts", "POST", { name: "乙" });
  const input = { sourceId: a.id, targetId: b.id, type: "合作", note: "项目" };
  local.handle("one", "/relationships", "POST", input);
  assert.throws(() => local.handle("one", "/relationships", "POST", input), /已存在/);
  const before = local.read("one");
  assert.throws(() => local.write("one", { ...before, extra: "大".repeat(3 * 1024 * 1024) }), /存储.*备份/);
  assert.deepEqual(local.read("one"), before);
});

test("invalid changes do not replace stored records", () => {
  store.clear();
  local.migrate("one", blank("one"));
  assert.throws(() => local.handle("one", "/contacts", "POST", { name: " ", id: 100 }), /姓名不能为空/);
  assert.equal(local.handle("one", "/contacts").length, 0);
  assert.throws(() => local.migrate("two", { ...blank("one") }), /旧数据格式/);
  assert.equal(local.read("two"), null);
});

test("batch validation is atomic", () => {
  store.clear();
  local.migrate("one", blank("one"));
  assert.throws(() => local.handle("one", "/contacts/batch", "POST", [{ name: "张三" }, { name: "" }]), /姓名不能为空/);
  assert.equal(local.handle("one", "/contacts").length, 0);
  const added = local.handle("one", "/contacts/batch", "POST", [{ name: "张三" }, { name: "李四" }]);
  assert.deepEqual(added.map(item => item.id), [1, 2]);
});
