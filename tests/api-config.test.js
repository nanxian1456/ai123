const assert = require("node:assert/strict");
const test = require("node:test");

const { getApiBaseUrl } = require("../miniprogram/utils/api-config");

test("development keeps the local API while preview and release require configuration", () => {
  global.wx = { getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }) };
  assert.equal(getApiBaseUrl(), "http://127.0.0.1:8080/api");
  wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: "trial" } });
  assert.throws(getApiBaseUrl, /请配置trial环境/);
  wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: "release" } });
  assert.throws(getApiBaseUrl, /请配置release环境/);
});
