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
  assert.ok([...store.keys()].filter(key => key.startsWith(prefix + ":g1:contacts:")).length > 1);
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
  assert.throws(() => local.handle(OWNER, "/contacts", "POST", { name: "写入失败" }), /存储空间不足/);
  failWritesAfter = Infinity;
  assert.deepEqual(local.read(OWNER), before);
  assert.deepEqual([...store.keys()].sort(), keysBefore);
});

test("old chunk generations are removed after a successful write", () => {
  reset();
  local.write(OWNER, dataset(10));
  local.handle(OWNER, "/contacts/1", "DELETE");
  const keys = [...store.keys()].filter(key => key.startsWith(prefix + ":"));
  assert.ok(keys.length > 0);
  assert.ok(keys.every(key => key.startsWith(prefix + ":g2:")), keys.join(", "));
  assert.equal(local.read(OWNER).contacts.length, 9);
});
