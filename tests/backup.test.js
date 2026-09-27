const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("node:crypto");
const store = new Map();
let files = new Map();
global.wx = {
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

test("backup encrypts profile, avatar and contacts; restore replaces only same owner", async () => {
  store.clear(); files = new Map([["/user/avatar.jpg", "YXZhdGFy"]]);
  local.migrate("owner-one", { ownerId: "owner-one", profile: { ownerId: "owner-one", nickname: "私密资料", avatarUrl: "/user/avatar.jpg" }, contacts: [{ id: 1, ownerId: "owner-one", name: "张三" }], relationships: [] });
  const encrypted = await backup.create("owner-one", "strong-passphrase");
  assert.equal(encrypted.includes("私密资料"), false);
  assert.equal(encrypted.includes("张三"), false);
  const opened = backup.open(encrypted, "strong-passphrase", "owner-one");
  assert.equal(backup.preview(local.read("owner-one"), opened).backupContacts, 1);
  local.handle("owner-one", "/contacts", "POST", { name: "李四" });
  await backup.restore("owner-one", opened);
  assert.equal(local.read("owner-one").contacts.length, 1);
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
