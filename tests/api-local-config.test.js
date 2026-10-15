const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const test = require("node:test");

function configured(localConfig, environment = "develop", platform = "android") {
  const context = {
    exports: {}, module: { exports: {} },
    require: () => localConfig,
    wx: {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: environment } }),
      getSystemInfoSync: () => ({ platform })
    }
  };
  context.exports = context.module.exports;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/utils/api-config.js"), "utf8"), context);
  return context.module.exports.getApiBaseUrl;
}

test("device API needs explicit local configuration instead of a hardcoded LAN address", () => {
  assert.throws(configured({}), /真机.*配置|配置.*真机/);
  assert.equal(configured({ deviceDevelop: "http://192.0.2.10:8080/api" })(), "http://192.0.2.10:8080/api");
});

test("release endpoint comes from build-local config and still requires HTTPS", () => {
  assert.equal(configured({ release: "https://example.invalid/api" }, "release")(), "https://example.invalid/api");
  assert.throws(configured({ release: "http://example.invalid/api" }, "release"), /HTTPS/);
});
