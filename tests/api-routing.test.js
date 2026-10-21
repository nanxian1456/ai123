const assert = require("node:assert/strict");
const test = require("node:test");
const store = new Map();
const remoteRequests = [];
const location = { center: { latitude: 32, longitude: 118 }, markers: [] };

global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
  getDeviceInfo: () => ({ platform: "devtools" }),
  getSystemInfoSync: () => ({ platform: "devtools" }),
  request(options) {
    remoteRequests.push(options);
    options.success({ statusCode: 200, data: structuredClone(location) });
  }
};
const local = require("../miniprogram/utils/local-data");
const api = require("../miniprogram/utils/api");

function seed() {
  store.clear();
  remoteRequests.length = 0;
  local.migrate("routing-owner", {
    ownerId: "routing-owner", contacts: [], relationships: []
  });
  store.set("ai-network-owner-id", "routing-owner");
  store.set("ai-network-auth-token", "routing-test-token");
  store.set("ai-network-token-expires-at", Date.now() + 60000);
}

test("map geocoding with page query parameters reaches the authenticated backend", async () => {
  seed();
  const query = "level=city&country=" + encodeURIComponent("中国") +
    "&province=" + encodeURIComponent("江苏省") + "&city=" + encodeURIComponent("南京市");
  for (const suffix of ["", "?" + query]) {
    assert.deepEqual(await api.request("/maps/locations" + suffix), location);
    const sent = remoteRequests.at(-1);
    const url = new URL(sent.url);
    assert.equal(url.pathname, "/api/maps/locations");
    assert.equal(url.search, suffix);
    assert.equal(sent.method, "GET");
    assert.equal(sent.header.Authorization, "Bearer routing-test-token");
  }
});

test("map counts stay local and similar unsupported paths are not sent to the backend", async () => {
  seed();
  assert.deepEqual(await api.request("/maps/regions?level=country&sample=true"), []);
  await assert.rejects(api.request("/maps/locations-extra?level=city"), /本地接口暂不支持/);
  assert.equal(remoteRequests.length, 0);
});
