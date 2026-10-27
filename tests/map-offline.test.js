const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const CONTACTS = [
  { id: 1, name: "Alice", organization: "", position: "", tags: [], initial: "A", latitude: 32.1, longitude: 118.9 },
  { id: 2, name: "Bob", organization: "", position: "", tags: [], initial: "B", latitude: null, longitude: null }
];

function loadPage({ regions, world = [] } = {}) {
  const storage = new Map([["ai-network-owner-id", "owner"]]);
  const requests = [];
  const clusters = [];
  const state = { version: 1, lookupFails: false };
  let page;
  const runtimeModule = { exports: {} };
  const sandbox = {
    module: runtimeModule,
    exports: runtimeModule.exports,
    setTimeout: () => 1,
    clearTimeout() {},
    require(id) {
      if (id.includes("utils/api")) return {
        request: async (url, method = "GET", data) => {
          const parsed = new URL(url, "http://localhost");
          requests.push(parsed.pathname);
          if (parsed.pathname === "/maps/regions") {
            const level = parsed.searchParams.get("level");
            if (regions) return regions(level, parsed.searchParams);
            if (level === "province") return [{ name: "江苏", count: 2 }, { name: "浙江", count: 1 }];
            if (level === "city") return [{ name: "南京", count: 2 }, { name: "苏州", count: 1 }];
            return [{ name: "中国", count: 3 }];
          }
          if (parsed.pathname === "/maps/locations") {
            if (state.lookupFails) throw new Error("定位服务不可用");
            return { center: { latitude: 38, longitude: -97 }, markers: data.regions.map(name => ({ name, latitude: 36.7, longitude: -119.4 })) };
          }
          if (parsed.pathname === "/contacts/directory") return CONTACTS;
          if (parsed.pathname === "/maps/search") return { regions: [], contacts: [] };
          throw new Error(url);
        },
        showError: error => { throw error; }
      };
      if (id.includes("contact-search")) return require(path.join(__dirname, "../miniprogram/utils/contact-search.js"));
      if (id.includes("utils/globe")) return require(path.join(__dirname, "../miniprogram/utils/globe.js"));
      if (id.includes("region-points")) return require(path.join(__dirname, "../miniprogram/utils/region-points.js"));
      if (id.includes("local-data")) return { changedAt: () => state.version };
      if (id.includes("world.js")) return world;
      if (id.includes("jiangsu.js")) return require(path.join(__dirname, "../miniprogram/assets/data/jiangsu.js"));
      return { createScopedThreejs() {} };
    },
    Page(definition) { page = definition; },
    wx: {
      createMapContext: () => ({ initMarkerCluster: options => clusters.push(options) }),
      getStorageSync: key => storage.has(key) ? structuredClone(storage.get(key)) : "",
      setStorageSync: (key, value) => storage.set(key, structuredClone(value))
    },
    console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/pages/map/index.js"), "utf8"), sandbox);
  page.data = structuredClone(page.data);
  page.setData = update => Object.assign(page.data, update);
  return { page, requests, state, storage, clusters };
}
const lookups = requests => requests.filter(item => item === "/maps/locations").length;
const flush = () => new Promise(resolve => setImmediate(resolve));

test("places in China are located offline without the backend", async () => {
  const { page, requests } = loadPage();
  page.setData({ level: "province", country: "中国" });
  await page.load();
  assert.deepEqual(Array.from(page.data.markers, marker => [marker.name, marker.latitude, marker.longitude]),
    [["江苏", 32.06, 118.8], ["浙江", 30.27, 120.15]]);
  assert.deepEqual({ ...page.data.center }, { latitude: 35.86, longitude: 104.2 });
  page.setData({ level: "city", province: "江苏" });
  await page.load();
  assert.deepEqual(Array.from(page.data.markers, marker => marker.name), ["南京", "苏州"]);
  assert.equal(lookups(requests), 0);
  assert.equal(page.data.mapError, "");
});

test("places abroad are looked up once and then served from the cache", async () => {
  const { page, requests, state } = loadPage({ regions: () => [{ name: "加州", count: 1 }] });
  page.setData({ level: "province", country: "美国" });
  await page.load();
  assert.equal(lookups(requests), 1);
  assert.deepEqual(Array.from(page.data.markers, marker => marker.name), ["加州"]);
  state.lookupFails = true;
  await page.load();
  assert.equal(lookups(requests), 1, "the cached coordinates need no second lookup");
  assert.deepEqual(Array.from(page.data.markers, marker => marker.name), ["加州"]);
  assert.deepEqual({ ...page.data.center }, { latitude: 38, longitude: -97 });
});

test("returning to the map tab keeps the view unless the contacts changed", async () => {
  const { page, requests, state } = loadPage();
  page.setData({ level: "city", country: "中国", province: "江苏" });
  await page.load();
  page.onKeyword({ detail: { value: "南" } });
  const loads = requests.filter(item => item === "/maps/regions").length;
  page.onHide();
  page.onShow();
  await flush();
  assert.equal(requests.filter(item => item === "/maps/regions").length, loads, "an unchanged map is not reloaded");
  assert.equal(page.data.keyword, "南");
  assert.deepEqual(Array.from(page.data.filteredRegions, item => item.name), ["南京"]);
  state.version = 2;
  page.onHide();
  page.onShow();
  await flush(); await flush();
  assert.equal(requests.filter(item => item === "/maps/regions").length, loads + 1, "changed contacts are reloaded");
  assert.equal(page.data.keyword, "南", "reloading the same place keeps the search");
  assert.deepEqual(Array.from(page.data.filteredRegions, item => item.name), ["南京"]);
});

test("contacts without a saved position are shown as estimates", async () => {
  const { page } = loadPage();
  page.setData({ level: "city", country: "中国", province: "江苏", city: "南京", citySelected: true });
  await page.load();
  const [alice, bob] = page.data.markers;
  assert.equal(alice.alpha, 1);
  assert.equal(alice.latitude, 32.1);
  assert.equal(bob.alpha, 0.5);
  assert.match(bob.label.content, /（估）/);
  assert.equal(page.data.approximateCount, 1);
  assert.deepEqual(Array.from(page.data.filteredContacts, row => row.approximate), [false, true]);
});

test("the map shows one status line and names the globe reset accurately", () => {
  const markup = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/map/index.wxml"), "utf8");
  assert.match(markup, />重置视角</);
  assert.doesNotMatch(markup, /回到地球|底图由微信加载|已取得坐标，正在等待地图更新/);
  assert.equal((markup.match(/class="map-status /g) || []).length, 1);
  assert.match(markup, /半透明标记为城市附近的估算位置/);
});

const realWorld = require(path.join(__dirname, "../miniprogram/assets/data/world.js"));
const points = require(path.join(__dirname, "../miniprogram/utils/region-points.js"));
const { countryCenter } = require(path.join(__dirname, "../miniprogram/utils/globe.js"));

test("common places abroad resolve offline under their Chinese or English names", () => {
  assert.deepEqual(points.regionPoint({ country: "USA", province: "加利福尼亚州" }), points.regionPoint({ country: "美国", province: "California" }));
  assert.deepEqual(points.regionPoint({ country: "美国", province: "德州" }), { latitude: 31.5, longitude: -99.3 });
  assert.deepEqual(points.regionPoint({ country: "美国", province: "纽约州", city: "New York" }), { latitude: 40.71, longitude: -74.01 });
  assert.deepEqual(points.regionPoint({ country: "日本", city: "东京都" }), { latitude: 35.68, longitude: 139.69 });
  assert.deepEqual(points.regionPoint({ country: "英国", city: "剑桥" }), { latitude: 52.21, longitude: 0.12 });
  assert.equal(points.regionPoint({ country: "美国", province: "波多黎各" }), null, "unknown places still go to the backend");
});

test("countries too small for the globe outlines still get a centre for markers and rotation", () => {
  assert.deepEqual(Array.from(countryCenter(realWorld, "新加坡")), [103.82, 1.35]);
  assert.deepEqual(Array.from(countryCenter(realWorld, "中国")), [105.67, 37.31]);
  assert.equal(countryCenter(realWorld, "不存在的国家"), null);
});

test("a country abroad is mapped from its outline and offline states without the backend", async () => {
  const { page, requests } = loadPage({ world: realWorld, regions: () => [{ name: "加州", count: 2 }, { name: "Texas", count: 1 }] });
  page.setData({ level: "province", country: "美国" });
  await page.load();
  assert.equal(lookups(requests), 0);
  assert.deepEqual(Array.from(page.data.markers, marker => marker.name), ["加州", "Texas"]);
  assert.ok(page.data.center && page.data.center.latitude > 30 && page.data.center.longitude < -90);
});

test("contacts in a city join marker clusters once per loaded map", async () => {
  const { page, clusters } = loadPage();
  page.setData({ level: "city", country: "中国", province: "江苏", city: "南京", citySelected: true });
  await page.load();
  assert.ok(Array.from(page.data.markers).every(marker => marker.joinCluster === true));
  const event = { currentTarget: { dataset: { loadId: page.data.mapLoadId } } };
  page.onMapUpdated(event);
  page.onMapUpdated(event);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].zoomOnClick, true);
});
