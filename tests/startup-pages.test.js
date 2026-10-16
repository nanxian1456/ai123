const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const realApi = require("../miniprogram/utils/api");

function loadPage(name, { api = {}, mediaBase = "http://192.168.1.2:8080" } = {}) {
  const source = fs.readFileSync(path.join(__dirname, `../miniprogram/pages/${name}/index.js`), "utf8");
  const calls = { navigations: [], toasts: [] };
  let definition;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: (id) =>
      id.endsWith("consent")
        ? { hasConsent: () => true, recordConsent() {} }
        : id.endsWith("api-config")
        ? { getMediaUrl: (p) => (mediaBase ? mediaBase + p : "") }
        : { showError: (error) => calls.toasts.push(error.message), hasProfileData: realApi.hasProfileData, ...api },
    Page: (value) => { definition = value; },
    wx: {
      navigateTo: (options) => calls.navigations.push(options.url),
      redirectTo: (options) => calls.navigations.push(options.url),
      switchTab: (options) => calls.navigations.push(options.url),
      showToast: (options) => calls.toasts.push(options.title),
    },
  });
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(values) { Object.assign(this.data, values); },
  };
  return { page, calls };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("the me tab never redirects automatically, so back navigation cannot loop", async () => {
  const legacy = { nickname: "老用户", profileCompleted: false, visibility: {} };
  const { page, calls } = loadPage("me", { api: { request: () => Promise.resolve(legacy) } });
  page.onShow();
  await flush();
  page.onShow();
  await flush();
  assert.deepEqual(calls.navigations, []);
  assert.equal(page.data.profile.nickname, "老用户");
  assert.equal(page.data.needsSetup, false);
});

test("an empty profile shows a setup prompt that opens the editor only when tapped", async () => {
  const empty = { nickname: "", profileCompleted: false, visibility: {} };
  const { page, calls } = loadPage("me", { api: { request: () => Promise.resolve(empty) } });
  page.onShow();
  await flush();
  assert.equal(page.data.needsSetup, true);
  assert.deepEqual(calls.navigations, []);
  page.edit();
  assert.deepEqual(calls.navigations, ["/pages/profile-setup/index?mode=edit"]);
});

test("the login background video comes from the configured backend and hides on error", () => {
  const { page } = loadPage("auth");
  page.onLoad();
  assert.equal(page.data.bgVideo, "http://192.168.1.2:8080/videos/background.mp4");
  page.onVideoError();
  assert.equal(page.data.bgVideo, "");
});

test("no video is requested when no backend address is configured", () => {
  const { page } = loadPage("auth", { mediaBase: "" });
  page.onLoad();
  assert.equal(page.data.bgVideo, "");
});

test("the login page no longer hard-codes a localhost video", () => {
  const markup = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/auth/index.wxml"), "utf8");
  assert.doesNotMatch(markup, /127\.0\.0\.1|localhost/);
});

test("the entry page keeps its own original video, independent of the login page", () => {
  const markup = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/entry/index.wxml"), "utf8");
  const script = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/entry/index.js"), "utf8");
  assert.match(markup, /<video[^>]*class="earth-video"[^>]*src="https:\/\/[^"]+\.mp4"/);
  assert.doesNotMatch(markup, /background\.mp4/);
  assert.doesNotMatch(script, /api-config|background-video/);
});

test("media URLs reuse the API host without the /api suffix", () => {
  const configSource = fs.readFileSync(path.join(__dirname, "../miniprogram/utils/api-config.js"), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(configSource, {
    module,
    exports: module.exports,
    require: () => ({ release: "https://api.example.cn/api" }),
    wx: {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
      getSystemInfoSync: () => ({ platform: "android" }),
    },
  });
  assert.equal(module.exports.getMediaUrl("/videos/background.mp4"), "https://api.example.cn/videos/background.mp4");
});

test("accepting the current policy opens existing local data without a network login", async () => {
  let networkCalls = 0;
  const { page, calls } = loadPage("auth", { api: {
    validateSession: () => Promise.resolve({ nickname: "本机用户" }),
    ensureSession: () => { networkCalls++; return Promise.reject(new Error("offline")); },
    request: () => { networkCalls++; return Promise.reject(new Error("offline")); }
  } });
  page.onLoad();
  await page.login();
  assert.equal(networkCalls, 0);
  assert.deepEqual(calls.navigations, ["/pages/index/index"]);
  assert.equal(page.data.loggingIn, false);
});

test("an incomplete local profile can be completed offline after policy agreement", async () => {
  let networkCalls = 0;
  const { page, calls } = loadPage("auth", { api: {
    validateSession: () => Promise.resolve({ nickname: "", profileCompleted: false }),
    ensureSession: () => { networkCalls++; return Promise.reject(new Error("offline")); },
    request: () => { networkCalls++; return Promise.reject(new Error("offline")); }
  } });
  page.onLoad();
  await page.login();
  assert.equal(networkCalls, 0);
  assert.deepEqual(calls.navigations, ["/pages/profile-setup/index"]);
});

for (const sessionError of [new Error("NO_SESSION"), Object.assign(new Error("登录已过期，请重新登录"), { code: "SESSION_INVALID" })]) {
  test(`policy confirmation logs in online when local identity is unavailable: ${sessionError.code || sessionError.message}`, async () => {
    let logins = 0;
    const { page, calls } = loadPage("auth", { api: {
      validateSession: () => Promise.reject(sessionError),
      ensureSession: force => { assert.equal(force, true); logins++; return Promise.resolve("new-token"); },
      request: route => { assert.equal(route, "/me"); return Promise.resolve({ nickname: "新登录用户" }); }
    } });
    page.onLoad();
    await page.login();
    assert.equal(logins, 1);
    assert.deepEqual(calls.navigations, ["/pages/index/index"]);
  });
}

test("a local read failure is surfaced without forcing login or replacing local data", async () => {
  let logins = 0;
  const { page, calls } = loadPage("auth", { api: {
    validateSession: () => Promise.reject(new Error("本机数据无法读取")),
    ensureSession: () => { logins++; return Promise.resolve("new-token"); },
    request: () => Promise.resolve({ nickname: "服务器旧数据" })
  } });
  page.onLoad();
  await page.login();
  assert.equal(logins, 0);
  assert.deepEqual(calls.navigations, []);
  assert.deepEqual(calls.toasts, ["本机数据无法读取"]);
  assert.equal(page.data.loggingIn, false);
});
