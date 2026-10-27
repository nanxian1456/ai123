const assert = require("node:assert/strict");
const test = require("node:test");
const store = new Map();
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key)
};
const regions = require("../miniprogram/utils/regions");
const local = require("../miniprogram/utils/local-data");

function seed(contacts) {
  store.clear();
  const owner = "regions-owner";
  local.migrate(owner, { ownerId: owner, profile: { nickname: "本人" }, contacts: [], relationships: [] });
  contacts.forEach(contact => local.handle(owner, "/contacts", "POST", contact));
  return owner;
}
const plain = value => JSON.parse(JSON.stringify(value));

test("different spellings of one place normalise to the same name", () => {
  assert.deepEqual(regions.regionOf({ country: "China", province: "江苏省", city: "南京市" }), { country: "中国", province: "江苏", city: "南京" });
  assert.deepEqual(regions.regionOf({ country: "中华人民共和国", province: "Jiangsu", city: "南京" }), { country: "中国", province: "江苏", city: "南京" });
  assert.deepEqual(regions.regionOf({ province: "广西壮族自治区", city: "桂林市" }), { country: "中国", province: "广西", city: "桂林" });
  assert.equal(regions.normalizeCity("延边朝鲜族自治州"), "延边");
  assert.equal(regions.normalizeCity("吉林市"), "吉林");
  // The short form would read as a province, so the full prefecture name is kept.
  assert.equal(regions.normalizeCity("海南藏族自治州"), "海南藏族自治州");
  assert.equal(regions.normalizeCity("沙市"), "沙市");
});

test("a missing country and province are filled in from mainland names only", () => {
  assert.deepEqual(regions.regionOf({ city: "苏州" }), { country: "中国", province: "江苏", city: "苏州" });
  assert.deepEqual(regions.regionOf({ province: "上海" }), { country: "中国", province: "上海", city: "上海" });
  assert.deepEqual(regions.regionOf({ province: "香港特别行政区" }), { country: "", province: "香港", city: "" });
  assert.deepEqual(regions.regionOf({ city: "某镇" }), { country: "", province: "", city: "某镇" });
  // Foreign places keep their own spelling.
  assert.deepEqual(regions.regionOf({ country: "USA", city: "纽约市" }), { country: "美国", province: "", city: "纽约市" });
});

test("map statistics merge spellings and count contacts without a country under China", () => {
  const owner = seed([
    { name: "甲", country: "中国", province: "江苏", city: "南京" },
    { name: "乙", province: "江苏省", city: "南京市" },
    { name: "丙", city: "苏州" },
    { name: "丁", country: "China", province: "Zhejiang", city: "杭州市" },
    { name: "戊" }
  ]);
  assert.deepEqual(plain(local.handle(owner, "/maps/regions?level=country")), [{ name: "中国", count: 4 }, { name: "", count: 1 }]);
  assert.deepEqual(plain(local.handle(owner, "/maps/regions?level=province&country=中国")), [{ name: "江苏", count: 3 }, { name: "浙江", count: 1 }]);
  assert.deepEqual(plain(local.handle(owner, "/maps/regions?level=city&country=中国&province=江苏省")), [{ name: "南京", count: 2 }, { name: "苏州", count: 1 }]);
  const nanjing = local.handle(owner, "/contacts/directory?country=中国&province=江苏&city=南京");
  assert.deepEqual(nanjing.map(contact => contact.name).sort(), ["乙", "甲"].sort());
  assert.equal(local.handle(owner, "/dashboard").cityCount, 3);
});

test("cross-level search finds places at every level and contacts anywhere", () => {
  const owner = seed([
    { name: "Alice", province: "江苏省", city: "南京市", phone: "13800001111" },
    { name: "Bob", city: "南京" },
    { name: "Carol", country: "美国", city: "纽约" }
  ]);
  const byPlace = local.handle(owner, "/maps/search?keyword=" + encodeURIComponent("南京市"));
  assert.deepEqual(plain(byPlace.regions), [{ level: "city", country: "中国", province: "江苏", city: "南京", count: 2 }]);
  const byProvince = local.handle(owner, "/maps/search?keyword=" + encodeURIComponent("江苏"));
  assert.deepEqual(plain(byProvince.regions), [{ level: "province", country: "中国", province: "江苏", city: "", count: 2 }]);
  const byPhone = local.handle(owner, "/maps/search?keyword=13800001111");
  assert.deepEqual(plain(byPhone.contacts), [{ id: 1, name: "Alice", organization: "", country: "中国", province: "江苏", city: "南京" }]);
  assert.deepEqual(plain(local.handle(owner, "/maps/search?keyword=")), { regions: [], contacts: [] });
});
