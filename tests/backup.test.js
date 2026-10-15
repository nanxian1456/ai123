const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("node:crypto");
const store = new Map();
let files = new Map();
global.wx = {
  createWorker: require("./helpers/crypto-worker"),
  env: { USER_DATA_PATH: "/user" },
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  getRandomValues: options => options.success({ randomValues: crypto.randomBytes(options.length) }),
  getFileSystemManager: () => ({
    readFile: options => files.has(options.filePath) ? options.success({ data: files.get(options.filePath) }) : options.fail(),
    writeFile: options => { files.set(options.filePath, options.data); options.success(); }
  })
};
const local = require("../miniprogram/utils/local-data");
const backup = require("../miniprogram/utils/backup");

test("oversized avatar restoration and oversized encrypted files fail before replacing data", async () => {
  store.clear(); files = new Map();
  local.migrate("owner-one", { ownerId: "owner-one", profile: null, contacts: [], relationships: [] });
  const before = local.read("owner-one");
  const oversizedAvatar = "AAAA".repeat(Math.ceil(5 * 1024 * 1024 / 3) + 1);
  await assert.rejects(backup.restore("owner-one", { data: before, avatar: oversizedAvatar }), /头像.*无效|头像.*5MB/);
  assert.deepEqual(local.read("owner-one"), before);
  assert.equal(files.size, 0);
  assert.throws(() => backup.open(" ".repeat(24 * 1024 * 1024 + 1), "strong-passphrase", "owner-one"), /24MB/);
  const largestAllowedAvatar = Buffer.alloc(5 * 1024 * 1024).toString("base64");
  await backup.restore("owner-one", { data: before, avatar: largestAllowedAvatar });
  assert.equal(files.get(local.read("owner-one").profile.avatarUrl), largestAllowedAvatar);
});

test("backup encrypts profile, avatar and contacts; restore replaces only same owner", async () => {
  store.clear(); files = new Map([["/user/avatar.jpg", "YXZhdGFy"]]);
  local.migrate("owner-one", { ownerId: "owner-one", profile: { ownerId: "owner-one", nickname: "私密资料", avatarUrl: "/user/avatar.jpg" }, contacts: [{ id: 1, ownerId: "owner-one", name: "张三" }], relationships: [] });
  local.handle("owner-one", "/tags", "POST", { name: "南京大学计算机学院" });
  const encrypted = await backup.create("owner-one", "strong-passphrase");
  assert.equal(encrypted.includes("私密资料"), false);
  assert.equal(encrypted.includes("张三"), false);
  assert.equal(encrypted.includes("南京大学计算机学院"), false);
  const opened = backup.open(encrypted, "strong-passphrase", "owner-one");
  assert.equal(backup.preview(local.read("owner-one"), opened).backupContacts, 1);
  local.handle("owner-one", "/contacts", "POST", { name: "李四" });
  await backup.restore("owner-one", opened);
  assert.equal(local.read("owner-one").contacts.length, 1);
  assert.deepEqual(local.read("owner-one").tagCatalog, ["南京大学计算机学院"]);
  assert.ok(local.read("owner-one").profile.avatarUrl.startsWith("/user/aimap-avatar-"));
  assert.equal(files.get(local.read("owner-one").profile.avatarUrl), "YXZhdGFy");
  assert.throws(() => backup.open(encrypted, "strong-passphrase", "owner-two"), /其他账号|格式无效/);
});

test("wrong password and modified backup cannot replace local data", async () => {
  store.clear(); files = new Map();
  local.migrate("owner-one", { ownerId: "owner-one", profile: null, contacts: [], relationships: [] });
  const encrypted = await backup.create("owner-one", "strong-passphrase");
  assert.throws(() => backup.open(encrypted, "wrong-password", "owner-one"), /密码错误/);
  const changed = JSON.parse(encrypted);
  changed.ciphertext = changed.ciphertext.replace(/^./, changed.ciphertext[0] === "A" ? "B" : "A");
  assert.throws(() => backup.open(JSON.stringify(changed), "strong-passphrase", "owner-one"), /文件已损坏/);
  assert.equal(local.read("owner-one").contacts.length, 0);
});

test("backup refuses malformed field types and relational records before writing", async () => {
  store.clear(); local.migrate("one", { ownerId: "one", profile: null, contacts: [], relationships: [] });
  const valid = local.read("one");
  const variants = [
    { ...valid, profile: { ...valid.profile, nickname: 123 } },
    { ...valid, profile: { ...valid.profile, visibility: { ...valid.profile.visibility, city: "false" } } },
    { ...valid, contacts: [{ id: 1, ownerId: "one", name: "甲", tags: [12] }], nextContactId: 2 },
    { ...valid, contacts: [{ id: -1, ownerId: "one", name: "甲" }] },
    { ...valid, contacts: [{ id: 1, ownerId: "one", name: "甲" }], nextContactId: 2, relationships: [{ id: 1, ownerId: "one", sourceId: 1, targetId: 1, type: "合作", note: "" }], nextRelationshipId: 2 }
  ];
  for (const data of variants) {
    await assert.rejects(backup.restore("one", { data, avatar: "" }), /无效/);
    assert.deepEqual(local.read("one"), valid);
    local.write("one", data);
    await assert.rejects(backup.create("one", "strong-passphrase"), /无效/);
    local.write("one", valid);
  }
  await assert.rejects(backup.restore("one", { data: valid, avatar: 123 }), /无效/);
  assert.throws(() => backup.open("{}", {}, "one"), /密码/);
});

test("restore detects concurrent changes while avatar is being written", async () => {
  store.clear(); local.migrate("one", { ownerId: "one", profile: null, contacts: [], relationships: [] });
  const incoming = { data: local.read("one"), avatar: "YXZhdGFy" };
  const original = wx.getFileSystemManager;
  let complete;
  wx.getFileSystemManager = () => ({ writeFile: options => { complete = options.success; } });
  const restoring = backup.restore("one", incoming);
  local.handle("one", "/contacts", "POST", { name: "刚添加" });
  complete();
  await assert.rejects(restoring, /数据已变化/);
  assert.equal(local.handle("one", "/contacts")[0].name, "刚添加");
  wx.getFileSystemManager = original;
});

test("restore rollback preserves newer edits", async () => {
  store.clear(); local.migrate("one", { ownerId: "one", profile: null, contacts: [], relationships: [] });
  const token = await backup.restore("one", { data: local.read("one"), avatar: "" });
  local.handle("one", "/contacts", "POST", { name: "刚添加" });
  assert.equal(backup.rollbackRestore("one", token), false);
  assert.equal(local.handle("one", "/contacts")[0].name, "刚添加");
});

test("backup creation refuses malformed avatar file contents", async () => {
  store.clear(); files = new Map([["/user/bad", 123]]);
  local.migrate("one", { ownerId: "one", profile: { avatarUrl: "/user/bad" }, contacts: [], relationships: [] });
  await assert.rejects(backup.create("one", "strong-passphrase"), /头像.*无效/);
});

test("restore keeps preview immutable and can roll back an unedited restore", async () => {
  store.clear(); files = new Map();
  local.migrate("one", { ownerId: "one", profile: null, contacts: [], relationships: [] });
  const before = local.read("one");
  const incoming = { data: local.read("one"), avatar: "YXZhdGFy" };
  const original = structuredClone(incoming);
  const token = await backup.restore("one", incoming);
  assert.deepEqual(incoming, original);
  assert.equal(backup.rollbackRestore("one", token), true);
  assert.deepEqual(local.read("one"), before);
});

test("async backup opening interoperates with format1 synchronous opening", async () => {
  store.clear(); files = new Map();
  local.migrate("one", { ownerId: "one", profile: null, contacts: [], relationships: [] });
  const content = await backup.create("one", "strong-passphrase");
  assert.equal(JSON.parse(content).rounds, 100000);
  assert.deepEqual(await backup.openAsync(content, "strong-passphrase", "one"), backup.open(content, "strong-passphrase", "one"));
  await assert.rejects(backup.openAsync(content, "wrong-password", "one"), /密码错误/);
});

test("unsupported workers cancel backup without freezing fallback or local writes", async () => {
  store.clear(); files = new Map();
  local.migrate("one", { ownerId: "one", profile: null, contacts: [], relationships: [] });
  const before = local.read("one");
  const original = wx.createWorker;
  delete wx.createWorker;
  try { await assert.rejects(backup.create("one", "strong-passphrase"), /更新微信.*后台|后台.*更新微信/); }
  finally { wx.createWorker = original; }
  assert.deepEqual(local.read("one"), before);
});

test("format1 backups preserve historical profile bounds and duplicate relationship entries", async () => {
  store.clear(); files = new Map();
  local.migrate("one", { ownerId: "one", profile: { nickname: "旧用户", organization: "组".repeat(100), position: "职".repeat(100), city: "城".repeat(100), bio: "介".repeat(500) },
    contacts: [{ id: 1, ownerId: "one", name: "甲" }, { id: 2, ownerId: "one", name: "乙" }],
    relationships: [{ id: 1, ownerId: "one", sourceId: 1, targetId: 2, type: "合作", note: "历史" }, { id: 2, ownerId: "one", sourceId: 1, targetId: 2, type: "合作", note: "历史" }] });
  const historical = local.read("one");
  await backup.restore("one", { data: historical, avatar: "" });
  const content = await backup.create("one", "strong-passphrase");
  const opened = await backup.openAsync(content, "strong-passphrase", "one");
  assert.deepEqual(opened.data, historical);
  assert.deepEqual(backup.open(content, "strong-passphrase", "one").data.relationships, historical.relationships);
  assert.throws(() => local.handle("one", "/relationships", "POST", { sourceId: 1, targetId: 2, type: "合作", note: "历史" }), /已存在/);
  const tooLong = structuredClone(historical); tooLong.profile.bio += "字";
  await assert.rejects(backup.restore("one", { data: tooLong, avatar: "" }), /资料.*无效/);
});
