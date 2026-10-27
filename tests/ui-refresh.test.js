const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const store = new Map();
const navigations = [], copied = [];
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ''),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key),
  navigateTo: options => navigations.push(options.url),
  switchTab: options => navigations.push(options.url),
  setClipboardData: options => copied.push(options.data),
  setNavigationBarTitle() {}, navigateBack() {}, showToast() {}, showModal() {}
};
const local = require('../miniprogram/utils/local-data');
function seed() {
  store.clear(); navigations.length = 0; copied.length = 0;
  local.migrate('ui-owner', { ownerId: 'ui-owner', contacts: [], relationships: [] });
  store.set('ai-network-owner-id', 'ui-owner');
}
function pageFor(name) {
  let page;
  const directory = path.join(__dirname, '../miniprogram/pages', name);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), {
    module, exports: module.exports, wx: global.wx, console, setTimeout, clearTimeout,
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
test('the home AI action opens the AI entry mode instead of the manual form', () => {
  seed(); pageFor('index').goAi();
  const target = new URL(navigations[0], 'https://mini.test');
  const form = pageFor('contact-form');
  form.onLoad(Object.fromEntries(target.searchParams));
  assert.equal(form.data.entryMode, 'ai');
});
test('switching entry methods preserves a draft and refuses unavailable edit methods', async () => {
  seed();
  const form = pageFor('contact-form'); form.onLoad({});
  form.input({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '草稿联系人' } });
  form.selectEntryMode({ currentTarget: { dataset: { mode: 'code' } } });
  assert.equal(form.data.entryMode, 'code');
  assert.equal(form.data.form.name, '草稿联系人');
  form.setData({ saving: true });
  form.selectEntryMode({ currentTarget: { dataset: { mode: 'ai' } } });
  assert.equal(form.data.entryMode, 'code');
  form.setData({ saving: false, id: '1', entryMode: 'manual' });
  form.selectEntryMode({ currentTarget: { dataset: { mode: 'batch' } } });
  assert.equal(form.data.entryMode, 'manual');
});
test('clearing directory filters restores contacts from every region and tag', async () => {
  seed();
  local.handle('ui-owner', '/contacts', 'POST', { name: '甲', country: '中国', province: '江苏', city: '南京', tags: ['合作'] });
  local.handle('ui-owner', '/contacts', 'POST', { name: '乙', country: '中国', province: '广东', city: '深圳', tags: [] });
  const page = pageFor('contacts');
  page.setData({ keyword: '甲', country: '中国', province: '江苏', city: '南京', regionFilter: true, filterLabel: '南京', selectedTag: '合作' });
  await page.loadContacts(); assert.equal(page.contactList.length, 1);
  await page.clearFilters();
  assert.equal(page.contactList.length, 2);
  assert.equal(page.data.selectedTag, ''); assert.equal(page.data.regionFilter, false);
});
test('contact copying exposes only the selected phone or email and ignores other fields', () => {
  seed(); const page = pageFor('contact-detail');
  page.setData({ contact: { id: 1, phone: ' 123456 ', email: 'person@example.test', note: 'private note' } });
  for (const field of ['phone', 'email', 'note']) page.copyField({ currentTarget: { dataset: { field } } });
  assert.deepEqual(copied, ['123456', 'person@example.test']);
});
test('an unavailable contact finishes loading and offers a recoverable error state', async () => {
  seed(); const page = pageFor('contact-detail');
  await page.loadContact('999');
  assert.equal(page.data.loading, false);
  assert.ok(page.data.loadError);
  assert.equal(page.data.contact, null);
});
test('saving cannot write a partial contact while an extraction or import is still in flight', async () => {
  for (const busyField of ['extracting', 'importing']) {
    seed(); const form = pageFor('contact-form');
    form.setData({ form: { ...form.data.form, name: '待核对联系人' }, [busyField]: true });
    await form.save();
    assert.equal(local.handle('ui-owner', '/contacts').length, 0);
  }
});
