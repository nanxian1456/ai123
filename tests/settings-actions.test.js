const test = require("node:test"),
  assert = require("node:assert/strict");
const store = new Map();
let mode, seen;
global.wx = {
  getStorageSync: (k) => structuredClone(store.get(k) || ""),
  setStorageSync: (k, v) => store.set(k, structuredClone(v)),
  removeStorageSync: (k) => store.delete(k),
  getAccountInfoSync: () => ({
    miniProgram: { envVersion: "develop", version: "0.1-test" },
  }),
  getDeviceInfo: () => ({ platform: "devtools" }),
  login: (o) => o.success({ code: "fresh-setting-code" }),
  request: (o) => {
    seen.push(o);
    if (o.url.endsWith("/auth/wechat-login"))
      return o.success({
        statusCode: 200,
        data: {
          token: "fresh-token",
          ownerId: "action-owner",
          expiresIn: 3600,
        },
      });
    if (mode === "offline") return o.fail({ errMsg: "timeout" });
    let data = o.url.endsWith("/sessions/revoke")
      ? { status: "revoked", ownerId: "action-owner" }
      : o.url.endsWith("/import-code/reset")
        ? { contactCode: "456GH789" }
        : {
            published: true,
            nickname: "公开昵称",
            organization: "公开单位",
            position: "",
            city: "",
            bio: "",
          };
    o.success({ statusCode: 200, data });
  },
};
const local = require("../miniprogram/utils/local-data"),
  api = require("../miniprogram/utils/api");
function seed() {
  store.clear();
  seen = [];
  mode = "ok";
  local.migrate("action-owner", {
    ownerId: "action-owner",
    profile: { nickname: "本机昵称" },
    contacts: [],
    relationships: [],
  });
  local.handle("action-owner", "/contacts", "POST", { name: "虚构联系人" });
  store.set("ai-network-owner-id", "action-owner");
  store.set("ai-network-auth-token", "old-token");
  store.set("ai-network-token-expires-at", Date.now() + 60000);
}
test("all-device logout clears the local session only after a successful revocation and keeps contacts", async () => {
  seed();
  assert.equal(typeof api.revokeAllSessions, "function");
  mode = "offline";
  await assert.rejects(api.revokeAllSessions());
  assert.equal(store.get("ai-network-owner-id"), "action-owner");
  mode = "ok";
  await api.revokeAllSessions();
  assert.equal(store.get("ai-network-owner-id"), undefined);
  assert.equal(local.read("action-owner").contacts.length, 1);
});
test("import code reset updates the current owner cache without changing contacts or publication choices", async () => {
  seed();
  assert.equal(typeof api.resetImportCode, "function");
  const code = await api.resetImportCode();
  assert.equal(code, "456GH789");
  assert.equal(local.read("action-owner").profile.contactCode, "456GH789");
  assert.equal(local.read("action-owner").contacts.length, 1);
  assert.equal(local.read("action-owner").profile.visibility.nickname, false);
});
test("public preview reads the server published snapshot rather than the local private profile", async () => {
  seed();
  const preview = await api.request("/me/published-profile");
  assert.equal(preview.published, true);
  assert.equal(preview.nickname, "公开昵称");
  assert.equal(preview.ownerId, undefined);
});

test("an explicit default-avatar save releases only the replaced local photo", async () => {
  seed();
  const data = local.read("action-owner");
  data.profile.avatarUrl = "wxfile://replaced-fixture";
  local.write("action-owner", data);
  const removed = [];
  wx.getFileSystemManager = () => ({
    removeSavedFile: (o) => removed.push(o.filePath),
  });
  await api.request("/me", "PATCH", {
    nickname: "测试昵称",
    avatarType: "male-2",
    resetAvatar: true,
  });
  assert.deepEqual(removed, ["wxfile://replaced-fixture"]);
});
