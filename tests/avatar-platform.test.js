const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const store = new Map();
const files = { removed: [], unlinked: [], nextSaved: "wxfile://store_2", saveFails: false };
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key),
  env: { USER_DATA_PATH: "wxfile://usr" },
  getFileSystemManager: () => ({
    saveFile: options => (files.saveFails ? options.fail() : options.success({ savedFilePath: files.nextSaved })),
    removeSavedFile: options => files.removed.push(options.filePath),
    unlink: options => files.unlinked.push(options.filePath),
  }),
};
const local = require("../miniprogram/utils/local-data");
const api = require("../miniprogram/utils/api");

function seed(avatarUrl) {
  store.clear();
  files.removed.length = 0; files.unlinked.length = 0;
  local.migrate("avatar-owner", { ownerId: "avatar-owner", contacts: [], relationships: [] });
  const data = local.read("avatar-owner");
  data.profile.avatarUrl = avatarUrl;
  local.write("avatar-owner", data);
  store.set("ai-network-owner-id", "avatar-owner");
}

test("changing the avatar deletes the replaced saved file so the 10MB saved-file quota is not used up", async () => {
  seed("wxfile://store_1");
  const profile = await api.uploadAvatar("wxfile://tmp_new");
  assert.equal(profile.avatarUrl, "wxfile://store_2");
  assert.equal(local.read("avatar-owner").profile.avatarUrl, "wxfile://store_2");
  assert.deepEqual(files.removed, ["wxfile://store_1"]);
});

test("an avatar restored from a backup file is unlinked, and remote URLs are never touched", async () => {
  seed("wxfile://usr/aimap-avatar-1.jpg");
  files.nextSaved = "wxfile://store_3";
  await api.uploadAvatar("wxfile://tmp_new");
  assert.deepEqual(files.unlinked, ["wxfile://usr/aimap-avatar-1.jpg"]);
  seed("https://example.com/a.png");
  files.nextSaved = "wxfile://store_4";
  await api.uploadAvatar("wxfile://tmp_new");
  assert.deepEqual(files.removed, []);
  assert.deepEqual(files.unlinked, []);
});

test("platform detection prefers wx.getDeviceInfo over the deprecated getSystemInfoSync", () => {
  const source = fs.readFileSync(path.join(__dirname, "../miniprogram/utils/api-config.js"), "utf8");
  const load = (wxMock) => {
    const module = { exports: {} };
    vm.runInNewContext(source, { module, exports: module.exports, require: () => ({ deviceDevelop: "http://10.0.0.2:8080/api" }), wx: wxMock });
    return module.exports;
  };
  let legacyCalls = 0;
  const config = load({
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
    getDeviceInfo: () => ({ platform: "android" }),
    getSystemInfoSync: () => { legacyCalls++; return { platform: "devtools" }; },
  });
  assert.equal(config.getApiBaseUrl(), "http://10.0.0.2:8080/api");
  assert.equal(legacyCalls, 0);
  const map = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/map/index.js"), "utf8");
  assert.doesNotMatch(map, /getSystemInfoSync\(/);
});
