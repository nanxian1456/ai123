const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("map drills from country to city contacts and back", async () => {
  const requests = [];
  const storage = new Map();
  let switchedTo = "";
  let navigatedTo = "";
  let page;
  const runtimeModule = { exports: {} };
  const sandbox = {
    module: runtimeModule,
    exports: runtimeModule.exports,
    require(id) {
      if (id.includes("utils/api")) return {
        request: async url => {
          const parsed = new URL(url, "http://localhost");
          requests.push(parsed);
          if (parsed.pathname === "/maps/regions") {
            const level = parsed.searchParams.get("level");
            if (level === "province") return [{ name: "Jiangsu", count: 2 }];
            if (level === "city") return [{ name: "Nanjing", count: 1 }, { name: "Suzhou", count: 1 }];
            return [{ name: "China", count: 2 }];
          }
          if (parsed.pathname === "/maps/locations") {
            const city = parsed.searchParams.get("city");
            return {
              center: city ? { latitude: 32, longitude: 118 } : { latitude: 31, longitude: 119 },
              markers: city ? [] : [{ name: "Nanjing", count: 1, latitude: 32, longitude: 118 }]
            };
          }
          if (parsed.pathname === "/contacts/directory") {
            return [{ id: 1, name: "Alice", organization: "", position: "", tags: [], initial: "A", latitude: 32.1, longitude: 118.9 }];
          }
          throw new Error(url);
        },
        showError: error => { throw error; }
      };
      if (id.includes("world.js")) return [];
      if (id.includes("jiangsu.json")) return JSON.parse(fs.readFileSync(path.join(__dirname, "../miniprogram/assets/data/jiangsu.json"), "utf8"));
      return { createScopedThreejs() {} };
    },
    Page(definition) { page = definition; },
    wx: {
      setStorageSync(key, value) { storage.set(key, value); },
      switchTab({ url }) { switchedTo = url; },
      navigateTo({ url }) { navigatedTo = url; }
    },
    console
  };
  const source = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/map/index.js"), "utf8");
  vm.runInNewContext(source, sandbox);
  page.setData = update => Object.assign(page.data, update);
  const load = page.load;
  let pending;
  page.load = function () { pending = load.call(this); return pending; };

  page.chooseRegion("China");
  await pending;
  assert.equal(page.data.level, "province");

  page.chooseRegion("Jiangsu");
  await pending;
  assert.equal(page.data.level, "city");
  assert.equal(page.data.province, "Jiangsu");
  assert.equal(page.data.citySelected, false);
  assert.equal(page.data.regions.length, 2);
  assert.equal(page.data.provincePolygons.length, 3);
  assert(page.data.provincePolygons.every(polygon => polygon.points.length <= 322));
  assert(page.data.includePoints.some(point => point.longitude < 118.5 && point.latitude < 31));
  assert(page.data.includePoints.some(point => point.longitude > 121.8 && point.latitude > 35));
  assert.equal(page.data.mapScale, 6);
  assert.equal(requests.filter(request => request.pathname === "/contacts/directory").length, 0);
  assert(requests.some(request => request.pathname === "/maps/locations" &&
    request.searchParams.get("level") === "city" && request.searchParams.get("province") === "Jiangsu" &&
    request.searchParams.get("city") === ""));

  page.chooseRegion("Nanjing");
  await pending;
  assert.equal(page.data.citySelected, true);
  assert.equal(page.data.city, "Nanjing");
  assert.equal(page.data.total, 1);
  assert.equal(page.data.cityContacts.length, 1);
  assert.equal(page.data.center.latitude, 32);
  assert.equal(page.data.markers[0].latitude, 32.1);
  assert.equal(page.data.markers[0].longitude, 118.9);
  assert(requests.some(request => request.pathname === "/maps/locations" &&
    request.searchParams.get("city") === "Nanjing"));
  assert(requests.some(request => request.pathname === "/contacts/directory" &&
    request.searchParams.get("country") === "China" &&
    request.searchParams.get("province") === "Jiangsu" &&
    request.searchParams.get("city") === "Nanjing"));
  page.viewCityContacts();
  assert.equal(switchedTo, "/pages/contacts/index");
  assert.equal(storage.get("contact-filter-region").city, "Nanjing");
  page.setContactLocation({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(navigatedTo, "/pages/contact-form/index?id=1");

  page.backToCityList();
  await pending;
  assert.equal(page.data.citySelected, false);
  assert.equal(page.data.cityContacts.length, 0);
  page.backToCountry();
  await pending;
  assert.equal(page.data.level, "province");
  assert.equal(page.data.province, "");
});

test("contacts without selected coordinates retain null instead of a zero-zero marker", () => {
  const data = new Map();
  global.wx = { getStorageSync: key => structuredClone(data.get(key) || ""),
    setStorageSync: (key, value) => data.set(key, structuredClone(value)), removeStorageSync: key => data.delete(key) };
  const local = require("../miniprogram/utils/local-data");
  const owner = "map-coordinate-test";
  local.migrate(owner, { ownerId: owner, contacts: [], relationships: [] });
  for (const value of [null, "", "   "]) {
    const contact = local.handle(owner, "/contacts", "POST", { name: "未选位置", latitude: value, longitude: value });
    assert.equal(contact.latitude, null);
    assert.equal(contact.longitude, null);
  }
  const zero = local.handle(owner, "/contacts", "POST", { name: "真实零坐标", latitude: 0, longitude: 0 });
  assert.equal(zero.latitude, 0);
  assert.equal(zero.longitude, 0);
});
