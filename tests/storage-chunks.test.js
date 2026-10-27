const assert = require("node:assert/strict");
const test = require("node:test");

const KEY_LIMIT = 1024 * 1024;
const store = new Map();
let failWritesAfter = Infinity;
function bytes(value) { return Buffer.byteLength(JSON.stringify(value), "utf8"); }
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => {
    if (failWritesAfter-- <= 0) throw new Error("setStorage:fail exceed storage max size");
    if (bytes(value) > KEY_LIMIT) throw new Error("setStorage:fail exceed max size per key");
    store.set(key, structuredClone(value));
  },
  removeStorageSync: key => store.delete(key)
};

const local = require("../miniprogram/utils/local-data");
const OWNER = "chunk-owner";
const prefix = "ai-network-local-v1:" + OWNER;
function contact(id) {
  return { id, ownerId: OWNER, name: `联系人${id}`, organization: "南京邮电大学", position: "教授", city: "南京", province: "江苏", phone: "", email: "", note: "备注".repeat(250), tags: ["高校专家"] };
}
function dataset(count) {
  const contacts = Array.from({ length: count }, (_, index) => contact(index + 1));
  return { version: 1, profile: { ownerId: OWNER, nickname: "", visibility: {} }, contacts, relationships: [{ id: 1, ownerId: OWNER, sourceId: 1, targetId: 2, type: "合作", note: "" }], tagCatalog: [], nextContactId: count + 1, nextRelationshipId: 2 };
}
function reset() { store.clear(); failWritesAfter = Infinity; }

test("thousands of long contacts are split below the per-key limit and read back intact", () => {
  reset();
  const data = dataset(3000);
  assert.ok(bytes(data) > 3 * KEY_LIMIT, "fixture should exceed a single key several times");
  local.write(OWNER, data);
  for (const [key, value] of store) if (key.startsWith(prefix)) assert.ok(bytes(value) <= KEY_LIMIT, `${key} is too large`);
  assert.ok(store.get(prefix).count > 1);
  assert.deepEqual(local.read(OWNER), data);
});

test("a legacy single-key record is still readable and is split on the next write", () => {
  reset();
  const data = dataset(3);
  store.set(prefix, structuredClone(data));
  assert.deepEqual(local.read(OWNER), data);
  local.handle(OWNER, "/contacts", "POST", { name: "新联系人" });
  assert.equal(store.get(prefix).contacts, undefined);
  assert.equal(local.read(OWNER).contacts.length, 4);
});

test("a failed write keeps the previous data and leaves no partial chunks", () => {
  reset();
  local.write(OWNER, dataset(10));
  const before = local.read(OWNER);
  const keysBefore = [...store.keys()].sort();
  failWritesAfter = 1;
  assert.throws(() => local.handle(OWNER, "/contacts", "POST", { name: "写入失败" }), /存储.*备份/);
  failWritesAfter = Infinity;
  assert.deepEqual(local.read(OWNER), before);
  assert.deepEqual([...store.keys()].sort(), keysBefore);
});

test("old chunk generations are removed after a successful write", () => {
  reset();
  local.write(OWNER, dataset(10));
  // The change-time marker is not a data shard and is meant to persist.
  const shardKeys = () => [...store.keys()].filter(key => key !== prefix && !key.startsWith("ai-network-data-changed:"));
  const previousKeys = shardKeys();
  local.handle(OWNER, "/contacts/1", "DELETE");
  const keys = shardKeys();
  assert.ok(keys.length > 0);
  assert.ok(previousKeys.every(key => !store.has(key)));
  assert.equal(local.read(OWNER).contacts.length, 9);
});

// The desktop development version stored each collection in separate array chunks.
// Real records in that format must survive the move to the remote branch's codec.
function seedLegacy(data = dataset(10), generation = 7) {
  const { contacts, relationships, ...rest } = structuredClone(data);
  function chunks(items) {
    const result = [];
    let part = [], size = 2;
    for (const item of items) {
      const amount = bytes(item) + 1;
      if (part.length && size + amount > 512 * 1024) { result.push(part); part = []; size = 2; }
      part.push(item); size += amount;
    }
    if (part.length) result.push(part);
    return result;
  }
  const contactParts = chunks(contacts);
  const relationshipParts = chunks(relationships);
  const layout = { generation, contacts: contactParts.length, relationships: relationshipParts.length };
  store.set(prefix, { ...rest, layout });
  const keys = [];
  for (const [name, parts] of [["contacts", contactParts], ["relationships", relationshipParts]]) {
    parts.forEach((part, index) => {
      const key = `${prefix}:g${generation}:${name}:${index}`;
      store.set(key, part);
      keys.push(key);
    });
  }
  return keys;
}

test("existing collection chunks remain readable without modifying their stored format", () => {
  reset();
  const data = dataset(1800);
  seedLegacy(data);
  const before = structuredClone([...store]);
  assert.deepEqual(local.read(OWNER), data);
  assert.deepEqual([...store], before);
});

test("collection chunks migrate atomically and clean only the migrated account", () => {
  reset();
  const legacyKeys = seedLegacy();
  const unrelated = `${prefix}-other:g7:contacts:0`;
  store.set(unrelated, [contact(99)]);
  local.handle(OWNER, "/contacts", "POST", { name: "合并后新增" });
  assert.equal(local.read(OWNER).contacts.length, 11);
  assert.equal(store.get(prefix).storage, "ai-network-sharded-v1");
  assert.ok(legacyKeys.every(key => !store.has(key)));
  assert.ok(store.has(unrelated));
});

test("a failed migration keeps every original collection chunk and the old manifest", () => {
  reset();
  const data = dataset(1800);
  seedLegacy(data);
  const before = structuredClone([...store]);
  failWritesAfter = 1;
  assert.throws(() => local.write(OWNER, { ...data, nextContactId: 9999 }), /存储.*备份/);
  failWritesAfter = Infinity;
  assert.deepEqual(local.read(OWNER), data);
  assert.deepEqual([...store], before);
});

test("damaged legacy chunks cannot be treated as missing data or overwritten by migration", () => {
  reset();
  const keys = seedLegacy();
  store.delete(keys[0]);
  const before = structuredClone([...store]);
  assert.throws(() => local.read(OWNER), /数据.*读取.*备份/);
  assert.throws(() => local.migrate(OWNER, { ownerId: OWNER, contacts: [], relationships: [] }), /数据.*读取.*备份/);
  assert.deepEqual([...store], before);
  const manifest = store.get(prefix);
  manifest.layout.contacts = -1;
  assert.throws(() => local.read(OWNER), /数据.*读取.*备份/);
});

test("legacy accounts with no contacts or relationships survive migration", () => {
  reset();
  const data = { ...dataset(0), relationships: [], nextRelationshipId: 1 };
  seedLegacy(data);
  assert.deepEqual(local.read(OWNER), data);
  local.write(OWNER, data);
  assert.deepEqual(local.read(OWNER), data);
});

test("clearing a legacy record removes its chunks after the index write succeeds", () => {
  reset();
  const keys = seedLegacy();
  local.write(OWNER, null);
  assert.equal(local.read(OWNER), null);
  assert.ok(keys.every(key => !store.has(key)));
});

test("legacy cleanup cannot delete an account whose index aliases an old chunk key", () => {
  reset();
  const keys = seedLegacy();
  const otherOwner = keys[0].slice("ai-network-local-v1:".length);
  const other = { ...dataset(0), profile: { ownerId: otherOwner }, relationships: [] };
  local.write(otherOwner, other);
  local.write(OWNER, dataset(10));
  assert.deepEqual(local.read(otherOwner), other);
  assert.equal(local.read(OWNER).contacts.length, 10);
});

test("a cleanup read failure cannot turn a committed legacy migration into a failed save", () => {
  reset();
  const keys = seedLegacy();
  const get = wx.getStorageSync;
  wx.getStorageSync = key => { if (key === keys[0]) throw new Error("cleanup read unavailable"); return get(key); };
  try { assert.doesNotThrow(() => local.write(OWNER, dataset(10))); }
  finally { wx.getStorageSync = get; }
  assert.equal(local.read(OWNER).contacts.length, 10);
});

test("storage usage remains available when the platform supports it", () => {
  reset();
  assert.equal(local.storageUsage(), null);
  wx.getStorageInfoSync = () => ({ currentSize: 320, limitSize: 10240 });
  try { assert.deepEqual(local.storageUsage(), { usedKB: 320, limitKB: 10240 }); }
  finally { delete wx.getStorageInfoSync; }
});
