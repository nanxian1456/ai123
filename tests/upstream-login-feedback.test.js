const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative, wx, dependencies) {
  const filename = path.join(__dirname, "..", relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  let page;
  vm.runInNewContext(code, { module, exports: module.exports, wx, Error, console,
    require(id) { if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`); return dependencies[id]; },
    Page(value) { page = value; }
  }, { filename });
  if (page) { page.data = structuredClone(page.data); page.setData = values => Object.assign(page.data, values); }
  return page || module.exports;
}

for (const mode of ["missing-code", "wx-failure"]) {
  test(`WeChat ${mode} returns actionable typed error without a backend call`, async () => {
    let requests = 0;
    const wx = { getStorageSync: () => "", login(options) {
      if (mode === "missing-code") options.success({ code: "", errMsg: "login:ok without code" });
      else options.fail({ errMsg: "login:fail test session expired" });
    }, request() { requests++; } };
    const api = load("miniprogram/utils/api.ts", wx, {
      "./local-data": {}, "./api-config": { getApiBaseUrl: () => "http://fixture/api" },
      "./account-state": {}, "./consent": {}
    });
    await assert.rejects(api.ensureSession(true), error => {
      assert.equal(error.code, "WECHAT_LOGIN_FAILED");
      assert.match(error.message, mode === "missing-code" ? /login:ok without code/ : /test session expired/);
      return true;
    });
    assert.equal(requests, 0);
  });
}

test("login page explains WeChat SDK failure and releases the button for retry", async () => {
  const modals = [], errors = [], navigations = [];
  const failure = Object.assign(new Error("微信登录调用失败（login:fail fixture）"), { code: "WECHAT_LOGIN_FAILED" });
  const page = load("miniprogram/pages/auth/index.ts", { showModal: value => modals.push(value),
    switchTab: value => navigations.push(value), redirectTo: value => navigations.push(value) }, {
    "../../utils/api": { validateSession: () => Promise.reject(failure), showError: value => errors.push(value) },
    "../../utils/api-config": {}, "../../utils/consent": { recordConsent() {} }
  });
  page.setData({ agreed: true });
  await page.login();
  assert.equal(modals.length, 1);
  assert.match(modals[0].content, /AppID/);
  assert.match(modals[0].content, /真机/);
  assert.match(modals[0].content, /login:fail fixture/);
  assert.equal(errors.length, 0);
  assert.equal(navigations.length, 0);
  assert.equal(page.data.loggingIn, false);
});

test("other login failures retain normal error handling", async () => {
  const errors = [];
  const failure = new Error("后端暂不可用");
  const page = load("miniprogram/pages/auth/index.ts", { showModal: () => assert.fail("unexpected SDK error modal") }, {
    "../../utils/api": { validateSession: () => Promise.reject(failure), showError: error => errors.push(error) },
    "../../utils/api-config": {}, "../../utils/consent": { recordConsent() {} }
  });
  page.setData({ agreed: true });
  await page.login();
  assert.deepEqual(errors, [failure]);
  assert.equal(page.data.loggingIn, false);
});
