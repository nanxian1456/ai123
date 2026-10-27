const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const store = new Map();
let alerts = [],
  modal;
global.wx = {
  getStorageSync: (k) => structuredClone(store.get(k) || ""),
  setStorageSync: (k, v) => store.set(k, structuredClone(v)),
  removeStorageSync: (k) => store.delete(k),
  showModal: (o) => (modal = o),
  enableAlertBeforeUnload: (o) => alerts.push(o.message),
  disableAlertBeforeUnload: () => alerts.push("off"),
  showToast() {},
  navigateBack() {},
  switchTab() {},
};
const local = require("../miniprogram/utils/local-data"),
  consent = require("../miniprogram/utils/consent");
function seed() {
  store.clear();
  alerts = [];
  store.set("ai-network-owner-id", "settings-a");
  local.migrate("settings-a", {
    ownerId: "settings-a",
    profile: { nickname: "测试账号" },
    contacts: [],
    relationships: [],
  });
}
function page(name, api) {
  let p;
  const directory = path.join(__dirname, "../miniprogram/pages", name),
    module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(directory, "index.js"), "utf8"),
    {
      module,
      exports: module.exports,
      Page: (v) => (p = v),
      wx: global.wx,
      Error,
      setTimeout: () => 1,
      require: (id) =>
        id.endsWith("/api") ? api : require(path.resolve(directory, id)),
    },
  );
  p.data = structuredClone(p.data);
  p.setData = (u) => {
    for (const [k, v] of Object.entries(u)) {
      if (k.startsWith("form.")) p.data.form[k.slice(5)] = v;
      else p.data[k] = v;
    }
  };
  return p;
}
test("a second owner does not inherit general or AI consent from the first", () => {
  seed();
  consent.recordConsent();
  consent.recordAiConsent();
  store.set("ai-network-owner-id", "settings-b");
  assert.equal(consent.hasAiConsent(), false);
  assert.equal(consent.hasConsent(), false);
  store.set("ai-network-owner-id", "settings-a");
  assert.equal(consent.hasAiConsent(), true);
});
test("AI consent modal cannot authorize an owner who switched while it was open", async () => {
  seed();
  const pending = consent.confirmAiTransfer();
  store.set("ai-network-owner-id", "settings-b");
  modal.success({ confirm: true });
  assert.equal(await pending, false);
  assert.equal(consent.hasAiConsent(), false);
});
test("choosing a default avatar clears a custom photo only on explicit reset", () => {
  seed();
  let d = local.read("settings-a");
  d.profile.avatarUrl = "wxfile://fixture-photo";
  local.write("settings-a", d);
  local.handle("settings-a", "/me", "PATCH", {
    nickname: "新昵称",
    avatarType: "male-1",
  });
  assert.equal(
    local.read("settings-a").profile.avatarUrl,
    "wxfile://fixture-photo",
  );
  const updated = local.handle("settings-a", "/me", "PATCH", {
    nickname: "新昵称",
    avatarType: "female-2",
    resetAvatar: true,
  });
  assert.equal(updated.avatarUrl, "");
  assert.equal(updated.avatarType, "female-2");
});
test("profile edits enable leave protection and saving clears it", async () => {
  seed();
  const api = {
    request: async (p, m, d) => local.handle("settings-a", p, m, d),
    showError: (e) => {
      throw e;
    },
  };
  const p = page("profile-setup", api);
  p.data.isEdit = true;
  await p.load();
  p.input({
    currentTarget: { dataset: { field: "nickname" } },
    detail: { value: "已编辑" },
  });
  assert.ok(alerts.some((x) => x !== "off"));
  await p.save();
  assert.equal(local.read("settings-a").profile.nickname, "已编辑");
  assert.equal(alerts.at(-1), "off");
});

test("withdrawal first exposes public-profile choices without immediately signing out", () => {
  seed();
  consent.recordConsent();
  let exited = false;
  const p = page("settings-privacy", { clearSession: () => (exited = true) });
  p.withdrawAll();
  assert.equal(p.data.withdrawalOptions, true);
  assert.equal(exited, false);
  assert.equal(consent.hasConsent(), true);
});
test("settings overview exposes current local publication and backup status", async () => {
  seed();
  const p = page("settings", {
    request: async () => local.read("settings-a").profile,
    getPendingAccountDeletion: () => "",
    showError() {},
  });
  assert.equal(typeof p.onShow, "function");
  await p.onShow();
  assert.match(p.data.publicationLabel, /本机|公开/);
  assert.match(p.data.backupLabel, /备份/);
});
test("diagnostics allowlist excludes account identifiers, tokens, API host and contact data", () => {
  seed();
  wx.getAccountInfoSync = () => ({
    miniProgram: { envVersion: "develop", version: "0.2" },
  });
  wx.getAppBaseInfo = () => ({
    SDKVersion: "3.17.3",
    version: "8.0-test",
    token: "DO_NOT_COPY_TOKEN",
  });
  wx.getDeviceInfo = () => ({
    platform: "android",
    model: "DO_NOT_COPY_DEVICE",
  });
  store.set("ai-network-auth-token", "DO_NOT_COPY_TOKEN");
  const file = path.join(__dirname, "../miniprogram/utils/support.js");
  const support = fs.existsSync(file) ? require(file) : {};
  assert.equal(typeof support.diagnostics, "function");
  const text = support.diagnostics().text;
  assert.match(text, /3\.17\.3/);
  assert.doesNotMatch(text, /settings-a|DO_NOT_COPY|192\.168|https?:\/\//);
});

test("public preview cannot race a visibility mutation", async () => {
  seed();
  let complete;
  const p = page("settings-friends", {
    request: async (route, method, data) =>
      route === "/me/published-profile"
        ? new Promise((resolve) => (complete = resolve))
        : route === "/me/import-code"
          ? "234CD567"
          : local.handle("settings-a", route, method, data),
    showError() {},
  });
  await p.load();
  const pending = p.previewPublic();
  p.changeVisibility({
    currentTarget: { dataset: { field: "city" } },
    detail: { value: true },
  });
  assert.equal(local.read("settings-a").profile.visibility.city, false);
  complete({ published: false });
  await pending;
});

test("a failed consent removal cannot be reported as a successful withdrawal", () => {
  seed();
  consent.recordAiConsent();
  const original = wx.removeStorageSync;
  wx.removeStorageSync = () => {
    throw new Error("disk busy");
  };
  try {
    assert.throws(() => consent.withdrawAiConsent());
    assert.equal(consent.hasAiConsent(), true);
  } finally {
    wx.removeStorageSync = original;
  }
});
