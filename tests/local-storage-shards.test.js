const assert = require("node:assert/strict");
const test = require("node:test");
const store = new Map();
let writeNumber = 0;
let failAt = 0;
const removed = [];
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => {
    if (++writeNumber === failAt) throw new Error("quota");
    assert.ok(Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8") <= 1024 * 1024);
    store.set(key, structuredClone(value));
  },
  removeStorageSync: key => { removed.push(key); store.delete(key); }
};
const local = require("../miniprogram/utils/local-data");
const api = require("../miniprogram/utils/api");
function data(ownerId, amount = 0) {
  return { version: 1, profile: { ownerId, nickname: "本机资料" }, contacts: Array.from({ length: amount }, (_, i) => ({ id: i + 1, ownerId, name: `联系人${i}`, note: "中文😀".repeat(100) })), relationships: [], nextContactId: amount + 1, nextRelationshipId: 1, tagCatalog: [] };
}
function reset() { store.clear(); removed.length = 0; writeNumber = 0; failAt = 0; }

test("contacts larger than 1MB roundtrip through bounded UTF8 shards with account isolation", () => {
  reset();
  const large = data("one", 2000);
  large.contacts[0].note += "\ud800";
  assert.ok(Buffer.byteLength(JSON.stringify(large), "utf8") > 1024 * 1024);
  local.write("one", large); local.write("two", data("two"));
  const manifest = store.get(local.key("one"));
  assert.ok(manifest.count > 1);
  for (const [key, value] of store) if (key.includes(":shard:")) assert.ok(Buffer.byteLength(value, "utf8") <= 200 * 1024);
  assert.deepEqual(local.read("one"), large);
  assert.equal(local.read("two").contacts.length, 0);
});

test("legacy data remains readable and migrates only after a successful manifest write", () => {
  reset(); const original = data("one"); store.set(local.key("one"), original);
  assert.deepEqual(local.read("one"), original); assert.equal(store.size, 1);
  failAt = 2;
  assert.throws(() => local.write("one", { ...original, extra: "changed" }), /存储.*备份/);
  assert.deepEqual(store.get(local.key("one")), original);
  assert.deepEqual(local.read("one"), original);
  assert.equal(store.size, 1);
  failAt = 0; local.write("one", { ...original, extra: "changed" });
  assert.equal(store.get(local.key("one")).storage, "ai-network-sharded-v1");
  assert.equal(local.read("one").extra, "changed");
});

test("a partial shard failure retains the previous generation and cleans only staged keys", () => {
  reset(); const original = data("one"); local.write("one", original);
  const oldManifest = structuredClone(store.get(local.key("one")));
  assert.equal(oldManifest.storage, "ai-network-sharded-v1");
  const oldKeys = [...store.keys()];
  failAt = writeNumber + 2;
  assert.throws(() => local.write("one", data("one", 2000)), /存储.*备份/);
  assert.deepEqual(store.get(local.key("one")), oldManifest);
  assert.deepEqual(local.read("one"), original);
  assert.deepEqual([...store.keys()], oldKeys);
  assert.ok(removed.every(key => !oldKeys.includes(key)));
});

test("successful commit removes only the previous account generation", () => {
  reset(); local.write("one", data("one")); local.write("two", data("two"));
  const otherKeys = [...store.keys()].filter(key => key.startsWith(local.key("two")) || key.startsWith("ai-network-local-shards-v1:two:shard:"));
  const oldKeys = [...store.keys()].filter(key => key.startsWith("ai-network-local-shards-v1:one:shard:"));
  assert.ok(oldKeys.length > 0);
  local.write("one", data("one", 1));
  assert.ok(oldKeys.every(key => !store.has(key)));
  assert.ok(otherKeys.every(key => store.has(key)));
  assert.ok(removed.every(key => oldKeys.includes(key)));
});

test("missing shard and invalid manifests raise recoverable errors instead of empty data", () => {
  reset(); local.write("one", data("one"));
  const shardKey = [...store.keys()].find(key => key.includes(":shard:"));
  store.delete(shardKey);
  assert.throws(() => local.read("one"), /数据.*读取.*备份/);
  store.set(local.key("one"), { storage: "ai-network-sharded-v1", version: 1, generation: "../two", count: 1, bytes: 50 });
  assert.throws(() => local.read("one"), /数据.*读取.*备份/);
  local.write("one", data("one"));
  assert.ok(removed.every(key => key.startsWith("ai-network-local-shards-v1:one:shard:") && !key.includes("../")));
});

test("aggregate quota failure retains data and optional cleanup is safe", () => {
  reset(); local.write("one", data("one")); const before = local.read("one");
  assert.throws(() => local.write("one", { ...before, extra: "汉".repeat(3 * 1024 * 1024) }), /存储.*备份/);
  assert.deepEqual(local.read("one"), before);
  const remove = wx.removeStorageSync; delete wx.removeStorageSync;
  try { local.write("one", { ...before, extra: "new" }); assert.equal(local.read("one").extra, "new"); }
  finally { wx.removeStorageSync = remove; }
});

test("global10MB quota accounts for staging and retains original committed data", () => {
  reset();
  const save = wx.setStorageSync;
  wx.setStorageSync = (key, value) => {
    const proposed = new Map(store); proposed.set(key, value);
    const bytes = [...proposed.values()].reduce((total, item) => total + Buffer.byteLength(typeof item === "string" ? item : JSON.stringify(item), "utf8"), 0);
    if (bytes > 10 * 1024 * 1024) throw new Error("total quota");
    save(key, value);
  };
  try {
    const original = { ...data("one"), extra: "x".repeat(6 * 1024 * 1024) };
    local.write("one", original);
    const oldKeys = [...store.keys()];
    assert.throws(() => local.write("one", { ...original, extra: "y".repeat(6 * 1024 * 1024) }), /存储.*备份/);
    assert.deepEqual(local.read("one"), original);
    assert.deepEqual([...store.keys()], oldKeys);
  } finally { wx.setStorageSync = save; }
});

test("owner identifiers cannot alias another account shard or original key", () => {
  reset(); local.write("one", data("one"));
  const target = [...store.keys()].find(key => key.includes(":shard:"));
  const owner = target.replace(/^ai-network-local-v1:/, "");
  local.write(owner, data(owner));
  local.write("one", data("one", 1));
  assert.equal(local.read(owner).profile.ownerId, owner);
  assert.equal(local.read("one").contacts.length, 1);
});

test("corrupt cached data rejects public API promises without triggering remigration", async () => {
  reset(); local.write("one", data("one"));
  const missing = [...store.keys()].find(key => key.includes(":shard:")); store.delete(missing);
  store.set("ai-network-owner-id", "one"); store.set("ai-network-auth-token", "token");
  let remote = 0;
  wx.request = options => { remote++; options.fail(); };
  const calls = [() => api.request("/contacts"), () => api.getCurrentOwnerId(), () => api.validateSession(), () => api.ensureSession()];
  for (const call of calls) {
    let promise;
    assert.doesNotThrow(() => { promise = call(); });
    await assert.rejects(promise, /数据.*读取.*备份/);
  }
  assert.equal(remote, 0);
  assert.ok(store.has(local.key("one")));
});

test("unrecognized stored versions and damaged manifest markers never appear as missing data", () => {
  reset();
  store.set(local.key("one"), { storage: "future-shards", version: 1, generation: "unknown" });
  assert.throws(() => local.read("one"), /数据.*读取.*备份/);
  store.set(local.key("one"), { ...data("one"), version: 2 });
  assert.throws(() => local.read("one"), /数据.*读取.*备份/);
});
