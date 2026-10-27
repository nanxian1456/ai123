const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const CONTACTS = [
  { id: 1, name: "Alice", organization: "", position: "", tags: [], initial: "A", latitude: 32.1, longitude: 118.9 },
  { id: 2, name: "Bob", organization: "", position: "", tags: [], initial: "B", phone: "13800001111", note: "认识于校友会", latitude: 32.2, longitude: 118.8 }
];

// Each request can be held back to simulate a slow load.
function loadPage({ hold = () => false } = {}) {
  const held = [];
  const navigated = [];
  const searches = [];
  let page;
  const runtimeModule = { exports: {} };
  const sandbox = {
    module: runtimeModule,
    exports: runtimeModule.exports,
    setTimeout: () => 1,
    clearTimeout() {},
    require(id) {
      if (id.includes("utils/api")) return {
        request: (url, method = "GET", data) => {
          if (url.startsWith("/maps/search?")) searches.push(new URL(url, "http://localhost").searchParams.get("keyword"));
          const reply = () => {
            const parsed = new URL(url, "http://localhost");
            if (parsed.pathname === "/maps/regions") {
              const level = parsed.searchParams.get("level");
              if (level === "province") return [{ name: "江苏", count: 2 }, { name: "浙江", count: 1 }];
              if (level === "city") return [{ name: "南京", count: 2 }];
              return [{ name: "中国", count: 3 }];
            }
            if (parsed.pathname === "/maps/locations") {
              return { center: { latitude: 32, longitude: 118 }, markers: (data.regions || []).map(name => ({ name, latitude: 31, longitude: 119 })) };
            }
            if (parsed.pathname === "/contacts/directory") return CONTACTS;
            if (parsed.pathname === "/maps/search") return {
              regions: [{ level: "province", country: "中国", province: "江苏", city: "", count: 2 }, { level: "city", country: "中国", province: "江苏", city: "南京", count: 2 }],
              contacts: [{ id: 1, name: "Alice", organization: "", country: "中国", province: "江苏", city: "南京" }, { id: 3, name: "Dan", organization: "", country: "", province: "", city: "" }]
            };
            throw new Error(url);
          };
          if (!hold(url)) return Promise.resolve(reply());
          return new Promise(resolve => held.push(() => resolve(reply())));
        },
        showError: error => { throw error; }
      };
      if (id.includes("contact-search")) return require(path.join(__dirname, "../miniprogram/utils/contact-search.js"));
      if (id.includes("utils/globe")) return require(path.join(__dirname, "../miniprogram/utils/globe.js"));
      if (id.includes("region-points")) return require(path.join(__dirname, "../miniprogram/utils/region-points.js"));
      if (id.includes("local-data")) return { changedAt: () => 0 };
      if (id.includes("world.js")) return [];
      if (id.includes("jiangsu.js")) return require(path.join(__dirname, "../miniprogram/assets/data/jiangsu.js"));
      return { createScopedThreejs() {} };
    },
    Page(definition) { page = definition; },
    wx: { navigateTo: options => navigated.push(options.url) },
    console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/pages/map/index.js"), "utf8"), sandbox);
  page.setData = update => Object.assign(page.data, update);
  const release = async () => { while (held.length) { held.shift()(); await new Promise(resolve => setImmediate(resolve)); } };
  return { page, release, navigated, searches };
}

const names = list => Array.from(list, item => item.name);

test("a global map search finishing after leaving the page is ignored", async () => {
  const { page, release } = loadPage({ hold: url => url.startsWith("/maps/search?") });
  page.onKeyword({ detail: { value: "Alice" } });
  page.onHide(); await release();
  assert.equal(page.data.globalContacts.length, 0);
  assert.equal(page.data.globalRegions.length, 0);
});

for (const replacement of ["Bob", ""]) {
  test(`finishing an old map load never restores the old search after changing keyword to ${JSON.stringify(replacement)}`, async () => {
    const { page, release, searches } = loadPage({ hold: url => url.startsWith("/maps/regions") });
    page.setData({ keyword: "Alice" });
    const loading = page.load();
    page.onKeyword({ detail: { value: replacement } });
    await release(); await loading;
    assert.equal(page.data.keyword, replacement);
    assert.deepEqual(searches, replacement ? [replacement] : []);
    if (!replacement) assert.equal(page.data.globalContacts.length, 0);
  });
}

test("a keyword typed while the city contacts load still filters the loaded list", async () => {
  const { page, release } = loadPage({ hold: url => url.startsWith("/contacts/directory") });
  page.setData({ level: "city", country: "中国", province: "江苏", city: "南京", citySelected: true });
  const loading = page.load();
  await new Promise(resolve => setImmediate(resolve));
  page.onKeyword({ detail: { value: "Alice" } });
  await release(); await loading;
  assert.equal(page.data.keyword, "Alice");
  assert.deepEqual(names(page.data.filteredContacts), ["Alice"]);
});

test("a keyword typed while the regions load still filters the region list", async () => {
  const { page, release } = loadPage({ hold: url => url.startsWith("/maps/regions") });
  page.setData({ level: "province", country: "中国" });
  const loading = page.load();
  page.onKeyword({ detail: { value: "浙" } });
  await release(); await loading;
  assert.deepEqual(Array.from(page.data.filteredRegions, item => item.name), ["浙江"]);
});

test("searching filters the map markers together with the list", async () => {
  const { page } = loadPage();
  page.setData({ level: "city", country: "中国", province: "江苏", city: "南京", citySelected: true });
  await page.load();
  assert.equal(page.data.markers.length, 2);
  page.onKeyword({ detail: { value: "Alice" } });
  assert.deepEqual(Array.from(page.data.markers, marker => marker.name), ["Alice"]);
  page.clearKeyword();
  assert.equal(page.data.markers.length, 2);

  page.setData({ level: "province", country: "中国", province: "", city: "", citySelected: false });
  await page.load();
  page.onKeyword({ detail: { value: "苏" } });
  assert.deepEqual(Array.from(page.data.markers, marker => marker.name), ["江苏"]);
  // The region picker offers the same filtered list it selects from.
  page.selectFromPicker({ detail: { value: 0 } });
  assert.equal(page.data.province, "江苏");
});

test("map contact search covers the same fields as the contacts page", async () => {
  const { page } = loadPage();
  page.setData({ level: "city", country: "中国", province: "江苏", city: "南京", citySelected: true });
  await page.load();
  page.onKeyword({ detail: { value: "13800001111" } });
  assert.deepEqual(names(page.data.filteredContacts), ["Bob"]);
  page.onKeyword({ detail: { value: "校友会" } });
  assert.deepEqual(names(page.data.filteredContacts), ["Bob"]);
});

test("an unmatched search is told apart from an empty level", () => {
  const markup = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/map/index.wxml"), "utf8");
  assert.match(markup, /没有找到“\{\{keyword\}\}”/);
  assert.match(markup, /bindtap="clearKeyword">清除搜索/);
  assert.match(markup, /range="\{\{filteredRegions\}\}"/);
  assert.doesNotMatch(markup, /暂无匹配数据/);
});

test("cross-level search lists places and contacts outside the current list and jumps to them", async () => {
  const { page, navigated } = loadPage();
  page.setData({ level: "province", country: "中国" });
  await page.load();
  page.onKeyword({ detail: { value: "Alice" } });
  await new Promise(resolve => setImmediate(resolve));
  // 江苏 is already in this province list, so only the city is offered again.
  assert.deepEqual(Array.from(page.data.globalRegions, hit => hit.label), ["中国 › 江苏 › 南京"]);
  assert.deepEqual(Array.from(page.data.globalContacts, hit => hit.place), ["中国 › 江苏 › 南京", "未设置地区"]);

  page.openGlobalContact({ currentTarget: { dataset: { id: "3" } } });
  assert.deepEqual(navigated, ["/pages/contact-detail/index?id=3"]);

  page.openGlobalContact({ currentTarget: { dataset: { id: "1" } } });
  await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.citySelected, true);
  assert.equal(page.data.city, "南京");
  assert.equal(page.data.keyword, "Alice");
  assert.deepEqual(names(page.data.filteredContacts), ["Alice"]);
  assert.deepEqual(Array.from(page.data.globalContacts), []);

  page.setData({ level: "country", country: "", province: "", city: "", citySelected: false });
  await page.load();
  page.onKeyword({ detail: { value: "江苏" } });
  await new Promise(resolve => setImmediate(resolve));
  const key = page.data.globalRegions[0].key;
  page.openGlobalRegion({ currentTarget: { dataset: { key } } });
  assert.equal(page.data.level, "city");
  assert.equal(page.data.province, "江苏");
  assert.equal(page.data.citySelected, false);
});
