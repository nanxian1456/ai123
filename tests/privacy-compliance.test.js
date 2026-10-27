const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "../miniprogram");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

function freshConsent(modalAnswer) {
  const store = new Map([["ai-network-owner-id", "privacy-fixture"]]);
  const modals = [];
  global.wx = {
    getStorageSync: (key) => (store.has(key) ? structuredClone(store.get(key)) : ""),
    setStorageSync: (key, value) => store.set(key, structuredClone(value)),
    removeStorageSync: (key) => store.delete(key),
    showModal: (options) => {
      assert.ok(Array.from(options.confirmText || "确定").length <= 4, "WeChat modal confirmation labels must not exceed 4 characters");
      modals.push(options);
      options.success({ confirm: modalAnswer });
    },
  };
  const file = require.resolve("../miniprogram/utils/consent");
  delete require.cache[file];
  return { consent: require(file), store, modals };
}

test("general and AI consent are recorded, versioned and withdrawable separately", () => {
  const { consent, store } = freshConsent(true);
  assert.equal(consent.hasConsent(), false);
  consent.recordConsent();
  consent.recordAiConsent();
  assert.equal(consent.hasConsent(), true);
  assert.equal(consent.hasAiConsent(), true);
  consent.withdrawAiConsent();
  assert.equal(consent.hasAiConsent(), false);
  assert.equal(consent.hasConsent(), true);
  store.set("ai-network-consent:privacy-fixture", { version: "older-version" });
  assert.equal(consent.hasConsent(), false, "a policy version change asks again");
  consent.recordConsent();
  consent.withdrawConsent();
  assert.equal(consent.hasConsent(), false);
});

test("text goes to DeepSeek only after explicit agreement, which is then remembered", async () => {
  const declined = freshConsent(false);
  assert.equal(await declined.consent.confirmAiTransfer(), false);
  assert.equal(declined.consent.hasAiConsent(), false);
  assert.match(declined.modals[0].content, /DeepSeek/);

  const accepted = freshConsent(true);
  assert.equal(await accepted.consent.confirmAiTransfer(), true);
  assert.equal(await accepted.consent.confirmAiTransfer(), true);
  assert.equal(accepted.modals.length, 1, "asked once, then remembered");
});

function loadPopup() {
  let definition;
  const calls = { listener: null, navigations: [], contracts: 0 };
  vm.runInNewContext(read("components/privacy-popup/index.js"), {
    Component: (value) => { definition = value; },
    wx: {
      onNeedPrivacyAuthorization: (listener) => { calls.listener = listener; },
      getPrivacySetting: (options) => options.success({ needAuthorization: true, privacyContractName: "《AI人脉地图隐私保护指引》" }),
      openPrivacyContract: () => { calls.contracts += 1; },
      navigateTo: (options) => calls.navigations.push(options.url),
      showToast() {},
    },
  });
  const component = {
    ...definition.methods,
    data: structuredClone(definition.data),
    setData(values) { Object.assign(this.data, values); },
  };
  definition.lifetimes.attached.call(component);
  return { component, calls };
}

test("the privacy popup resolves WeChat's authorization with the agree button", () => {
  const { component, calls } = loadPopup();
  assert.equal(component.data.contractName, "《AI人脉地图隐私保护指引》");
  const results = [];
  calls.listener((result) => results.push(result));
  assert.equal(component.data.show, true);
  component.agree();
  assert.deepEqual(JSON.parse(JSON.stringify(results)), [{ buttonId: "privacy-agree", event: "agree" }]);
  assert.equal(component.data.show, false);
  const markup = read("components/privacy-popup/index.wxml");
  assert.match(markup, /id="privacy-agree"[^>]*open-type="agreePrivacyAuthorization"/);
});

test("declining privacy authorization rejects the pending API call", () => {
  const { component, calls } = loadPopup();
  const results = [];
  calls.listener((result) => results.push(result));
  component.disagree();
  assert.deepEqual(JSON.parse(JSON.stringify(results)), [{ event: "disagree" }]);
  component.openContract();
  component.openPolicy();
  assert.equal(calls.contracts, 1);
  assert.deepEqual(calls.navigations, ["/pages/legal/index?doc=privacy"]);
});

test("every page that calls a privacy API includes the authorization popup", () => {
  const PRIVACY_APIS = /wx\.(getClipboardData|setClipboardData|chooseMedia|chooseImage|chooseVideo|chooseMessageFile|saveImageToPhotosAlbum|getLocation|chooseLocation|getUserProfile)\b/;
  const pages = fs.readdirSync(path.join(ROOT, "pages"));
  const offenders = [];
  let checked = 0;
  for (const page of pages) {
    const script = path.join(ROOT, "pages", page, "index.js");
    if (!fs.existsSync(script) || !PRIVACY_APIS.test(fs.readFileSync(script, "utf8"))) continue;
    checked += 1;
    const markup = read(`pages/${page}/index.wxml`);
    const config = JSON.parse(read(`pages/${page}/index.json`));
    if (!/<privacy-popup\b/.test(markup) || !(config.usingComponents || {})["privacy-popup"]) offenders.push(page);
  }
  assert.ok(checked >= 5, `expected the clipboard/album/file pages, found ${checked}`);
  assert.deepEqual(offenders, []);
});

test("login requires agreeing to the terms and privacy policy first", async () => {
  let definition;
  const calls = { toasts: [], logins: 0, recorded: 0, navigations: [] };
  vm.runInNewContext(read("pages/auth/index.js"), {
    module: { exports: {} },
    exports: {},
    require: (id) =>
      id.endsWith("consent")
        ? { hasConsent: () => false, recordConsent: () => { calls.recorded += 1; } }
        : id.endsWith("api-config")
          ? { getMediaUrl: () => "" }
          : { validateSession: () => Promise.reject(new Error("NO_SESSION")), ensureSession: () => { calls.logins += 1; return new Promise(() => {}); }, request() {}, hasProfileData() {}, showError() {} },
    Page: (value) => { definition = value; },
    wx: { showToast: (options) => calls.toasts.push(options.title), navigateTo: (options) => calls.navigations.push(options.url) },
  });
  const page = { ...definition, data: structuredClone(definition.data), setData(values) { Object.assign(this.data, values); } };
  page.onLoad();
  page.login();
  assert.equal(calls.logins, 0);
  assert.match(calls.toasts[0], /用户协议和隐私政策/);
  page.openTerms();
  page.openPrivacy();
  assert.deepEqual(calls.navigations, ["/pages/legal/index?doc=terms", "/pages/legal/index?doc=privacy"]);
  page.toggleAgree();
  page.login();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.recorded, 1);
  assert.equal(calls.logins, 1);
  const markup = read("pages/auth/index.wxml");
  assert.doesNotMatch(markup, /数据仅自己可见/);
});

test("returning users who have not agreed to the current policy confirm it before entering", () => {
  let definition;
  const calls = { relaunches: [], validated: 0 };
  vm.runInNewContext(read("pages/entry/index.js"), {
    module: { exports: {} },
    exports: {},
    require: (id) =>
      id.endsWith("consent") ? { hasConsent: () => false }
        : id.endsWith("api-config") ? { getMediaUrl: () => "" }
          : { validateSession: () => { calls.validated += 1; return Promise.resolve({}); }, getPendingAccountDeletion: () => "", clearSession() {}, hasProfileData() {}, showError() {} },
    Page: (value) => { definition = value; },
    wx: { reLaunch: (options) => calls.relaunches.push(options.url) },
  });
  const page = { ...definition, data: structuredClone(definition.data), setData(values) { Object.assign(this.data, values); } };
  page.enterHome();
  assert.deepEqual(calls.relaunches, ["/pages/auth/index"]);
  assert.equal(calls.validated, 0);
});

test("the policy covers every data flow the app actually has", () => {
  const { DOCS } = require("../miniprogram/utils/legal");
  const text = DOCS.privacy.sections.flatMap((section) => section.paragraphs).join("\n");
  for (const required of ["openid", "DeepSeek", "导入码", "剪贴板", "相册", "聊天中的文件", "日志", "撤回", "删除", "早期版本"]) {
    assert.ok(text.includes(required), `privacy policy should mention ${required}`);
  }
  assert.ok(DOCS.terms.sections.length >= 5);
  const appConfig = JSON.parse(read("app.json"));
  assert.ok(appConfig.pages.includes("pages/legal/index"));
});

test("withdraw-all uses a valid WeChat modal and clears consent before signing out", () => {
  const { consent } = freshConsent(true);
  consent.recordConsent();
  consent.recordAiConsent();
  let definition, signedOut = false;
  const destinations = [];
  const runtimeModule = { exports: {} };
  const wx = { ...global.wx, reLaunch: options => destinations.push(options.url),
    showModal: options => {
      assert.ok(Array.from(options.confirmText || "确定").length <= 4, "WeChat modal confirmation labels must not exceed 4 characters");
      options.success({ confirm: true });
    }
  };
  vm.runInNewContext(read("pages/settings-privacy/index.js"), {
    module: runtimeModule, exports: runtimeModule.exports,
    require: id => id.endsWith("account-state") ? require("../miniprogram/utils/account-state") : id.endsWith("consent") ? consent : { clearSession: () => { signedOut = true; } },
    Page: value => { definition = value; }, wx
  });
  definition.setData = values => Object.assign(definition.data, values);
  definition.withdrawAll();
  assert.equal(consent.hasConsent(), true);
  definition.confirmWithdrawAll();
  assert.equal(consent.hasConsent(), false);
  assert.equal(consent.hasAiConsent(), false);
  assert.equal(signedOut, true);
  assert.deepEqual(destinations, ["/pages/entry/index"]);
});
