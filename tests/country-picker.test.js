const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const store = new Map();
let confirm = true, modals = [];
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ''),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key),
  showModal(options) { modals.push(options); options.success({ confirm }); },
  showToast() {}, setNavigationBarTitle() {}, navigateBack() {}, pageScrollTo() {},
  request() { throw new Error('country selection must work without backend'); }
};
const local = require('../miniprogram/utils/local-data');
const regions = require('../miniprogram/utils/regions');
const owner = 'country-picker-owner';
function formPage() {
  store.clear(); confirm = true; modals = [];
  local.migrate(owner, { ownerId: owner, contacts: [], relationships: [] });
  store.set('ai-network-owner-id', owner);
  let page;
  const directory = path.join(__dirname, '../miniprogram/pages/contact-form');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), {
    module, exports: module.exports, wx: global.wx, console, setTimeout: () => 1,
    Page(value) { page = value; }, require(id) { return require(path.resolve(directory, id)); }
  });
  page.data = structuredClone(page.data);
  page.setData = update => {
    for (const [key, value] of Object.entries(update)) {
      if (key.startsWith('form.')) page.data.form[key.slice(5)] = value;
      else page.data[key] = value;
    }
  };
  return page;
}
const selection = code => ({ currentTarget: { dataset: { code } } });
function located(page) {
  Object.assign(page.data.form, { name: '测试联系人', country: 'China', province: '江苏省', city: '南京市', address: '测试位置', latitude: 32, longitude: 118 });
}
test('offline country lookup supports Chinese, English, codes and aliases beyond common countries', () => {
  assert.equal(regions.searchCountries?.('usa')[0]?.name, '美国');
  assert.equal(regions.searchCountries('United States')[0].code, 'US');
  assert.equal(regions.searchCountries('中华人民共和国')[0].code, 'CN');
  assert.equal(regions.searchCountries('萨摩亚')[0].code, 'WS');
  assert.equal(regions.normalizeCountry('Singapore'), '新加坡');
  assert.equal(regions.normalizeCountry('WS'), '萨摩亚');
  assert.equal(regions.normalizeCountry('无法识别的旧名称'), '无法识别的旧名称');
});
test('opening the picker preserves legacy spelling and offers no IP-based default', () => {
  const page = formPage();
  assert.equal(typeof page.openCountryPicker, 'function');
  page.openCountryPicker();
  assert.equal(page.data.form.country, '');
  assert.ok(page.data.countryOptions.length > 200);
  page.data.form.country = '无法识别的旧名称';
  page.openCountryPicker();
  assert.equal(page.data.form.country, '无法识别的旧名称');
});
test('changing country is cancellable and confirmed changes clear dependent address and coordinates', async () => {
  const page = formPage(); located(page);
  assert.equal(typeof page.selectCountry, 'function');
  const before = structuredClone(page.data.form);
  confirm = false;
  await page.selectCountry(selection('US'));
  assert.deepEqual(page.data.form, before);
  confirm = true;
  await page.selectCountry(selection('US'));
  assert.equal(page.data.form.country, '美国');
  for (const field of ['province', 'city', 'address']) assert.equal(page.data.form[field], '');
  assert.equal(page.data.form.latitude, null);
  assert.equal(page.data.form.longitude, null);
  assert.equal(page.data.form.name, '测试联系人');
  assert.equal(modals.length, 2);
  page.openCountryPicker();
  assert.equal(page.data.recentCountries[0].code, 'US');
});
test('selecting the same country alias preserves existing location without a confirmation', async () => {
  const page = formPage(); located(page);
  assert.equal(typeof page.selectCountry, 'function');
  await page.selectCountry(selection('CN'));
  assert.equal(page.data.form.country, '中国');
  assert.equal(page.data.form.city, '南京市');
  assert.equal(page.data.form.latitude, 32);
  assert.equal(modals.length, 0);
});
test('domestic province and city choices are linked; changing province clears a previous city safely', async () => {
  const page = formPage(); located(page);
  assert.equal(typeof page.changeProvince, 'function');
  page.refreshRegionChoices();
  const index = page.data.provinceOptions.indexOf('浙江');
  assert.ok(index > 0);
  await page.changeProvince({ detail: { value: String(index) } });
  assert.equal(page.data.form.province, '浙江');
  assert.equal(page.data.form.city, '');
  assert.ok(page.data.cityOptions.includes('杭州'));
  page.changeCity({ detail: { value: String(page.data.cityOptions.indexOf('杭州')) } });
  assert.equal(page.data.form.city, '杭州');
  assert.equal(page.data.form.latitude, null);
});
test('foreign contacts can be saved locally with a city and no province', async () => {
  const page = formPage();
  assert.equal(typeof page.selectCountry, 'function');
  await page.selectCountry(selection('SG'));
  Object.assign(page.data.form, { name: '海外测试联系人', city: 'Singapore' });
  await page.save();
  const contact = local.handle(owner, '/contacts')[0];
  assert.equal(contact.country, '新加坡');
  assert.equal(contact.province, '');
  assert.equal(contact.city, 'Singapore');
});
test('explicitly choosing unspecified clears the old region so inference cannot restore its old country', async () => {
  const page = formPage(); located(page);
  assert.equal(typeof page.selectCountry, 'function');
  await page.selectCountry(selection(''));
  assert.deepEqual(regions.regionOf(page.data.form), { country: '', province: '', city: '' });
});
test('busy forms cannot switch country or rewrite the draft through an old selection', async () => {
  const page = formPage(); located(page);
  assert.equal(typeof page.selectCountry, 'function');
  page.data.saving = true;
  await page.selectCountry(selection('US'));
  assert.equal(page.data.form.country, 'China');
  assert.equal(modals.length, 0);
});
test('a foreign city missing from the offline catalog can request coordinates without a province', async () => {
  formPage();
  // A place missing from the offline coordinate table, so the backend is asked.
  local.handle(owner, '/contacts', 'POST', { name: '海外地图测试', country: '新加坡', city: 'Jurong' });
  let page;
  const requests = [];
  const directory = path.join(__dirname, '../miniprogram/pages/map');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), {
    module, exports: module.exports, wx: global.wx, console, setTimeout: () => 1, clearTimeout() {},
    Page(value) { page = value; },
    require(id) {
      if (id.includes('utils/api')) return {
        request: async (url, method, data) => {
          if (url === '/maps/locations') {
            requests.push(data);
            return { center: { latitude: 1.35, longitude: 103.82 }, markers: [] };
          }
          return local.handle(owner, url, method, data);
        }, showError(error) { throw error; }
      };
      if (id.includes('world.js') || id.includes('jiangsu.js')) return [];
      if (id.includes('threejs')) return {};
      return require(path.resolve(directory, id));
    }
  });
  page.data = structuredClone(page.data);
  page.setData = update => Object.assign(page.data, update);
  page.setData({ level: 'city', country: '新加坡', province: '', city: 'Jurong', citySelected: true });
  await page.load();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].province, '');
  assert.equal(page.data.mapError, '');
  assert.equal(page.data.filteredContacts[0].name, '海外地图测试');
});
test('applying AI location fields refreshes domestic choices without rewriting the legacy country', () => {
  const page = formPage();
  page.data.aiDraft = { province: '江苏省', city: '南京市' };
  page.applyAiDraft();
  assert.equal(page.data.domesticRegion, true);
  assert.ok(page.data.cityOptions.includes('南京'));
  assert.equal(page.data.form.country, '');
});
test('expanded country aliases merge map groups while raw legacy values stay intact', () => {
  formPage();
  local.handle(owner, '/contacts', 'POST', { name: '旧代码', country: 'WS' });
  local.handle(owner, '/contacts', 'POST', { name: '旧英文', country: 'Samoa' });
  const groups = local.handle(owner, '/maps/regions?level=country');
  assert.deepEqual(groups, [{ name: '萨摩亚', count: 2 }]);
  assert.equal(local.handle(owner, '/contacts')[0].country, 'WS');
});
