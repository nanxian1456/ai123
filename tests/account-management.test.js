const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const store = new Map();
let errors = [], writes = [], shares = [], shareFails = false;
global.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageSync: key => structuredClone(store.get(key) || ''),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key),
  getStorageInfoSync: () => ({ currentSize: 512, limitSize: 10240 }),
  showToast() {}, reLaunch() {},
  shareFileMessage(options) { shares.push(options); shareFails ? options.fail({}) : options.success({}); },
  getFileSystemManager: () => ({ writeFile(o) { writes.push(o); o.success({}); } }),
};
const local = require('../miniprogram/utils/local-data');
const api = require('../miniprogram/utils/api');
const owner = 'account-fixture';
function seed() {
  store.clear(); errors = []; writes = []; shares = []; shareFails = false;
  global.wx.getFileSystemManager = () => ({ writeFile(o) { writes.push(o); o.success({}); } });
  local.migrate(owner, { ownerId: owner, profile: { nickname: '测试账号', profileCompleted: true }, contacts: [], relationships: [] });
  store.set('ai-network-owner-id', owner);
}
function pageFor(name, overrides = {}, backupOverride) {
  const directory = path.join(__dirname, '../miniprogram/pages', name);
  let page;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), {
    module, exports: module.exports, wx: global.wx, console, Error, setTimeout: () => 1,
    Page(value) { page = value; },
    require(id) {
      if (id.endsWith('/api')) return { ...api, showError: e => errors.push(e), ...overrides };
      if (id.endsWith('/backup') && backupOverride) return backupOverride;
      return require(path.resolve(directory, id));
    }
  });
  page.data = structuredClone(page.data);
  page.setData = update => Object.assign(page.data, update);
  return page;
}
test('my profile read failure ends loading and retry recovers without a login redirect', async () => {
  seed(); let failing = true;
  const page = pageFor('me', { request: () => failing ? Promise.reject(new Error('读取失败')) : api.request('/me') });
  await page.load();
  assert.equal(page.data.loading, false);
  assert.match(page.data.loadError, /读取失败/);
  failing = false; await page.load();
  assert.equal(page.data.loadError, '');
  assert.equal(page.data.profile.nickname, '测试账号');
});
test('import code network failure leaves local profile available and ends code loading', async () => {
  seed();
  const page = pageFor('settings-friends', { request: p => p === '/me/import-code' ? Promise.reject(new Error('离线')) : api.request(p) });
  await page.onShow(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.profile?.nickname, '测试账号');
  assert.equal(page.data.codeLoading, false);
  assert.match(page.data.codeError, /离线/);
});
test('a verified cached import code remains usable offline without a fake code', async () => {
  seed(); const data = local.read(owner); data.profile.contactCode = '234CD567'; local.write(owner, data);
  const page = pageFor('settings-friends', { request: p => p === '/me/import-code' ? Promise.reject(new Error('离线')) : api.request(p) });
  await page.onShow(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.contactCode, '234CD567');
  assert.equal(page.data.codeFromCache, true);
});
test('a successfully fetched code is cached for this owner for later offline use', async () => {
  seed();
  store.set('ai-network-auth-token', 'fixture-token');
  store.set('ai-network-token-expires-at', Date.now() + 60000);
  global.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: 'develop' } });
  global.wx.getDeviceInfo = () => ({ platform: 'devtools' });
  global.wx.request = options => options.success({ statusCode: 200, data: { contactCode: '345EF678' } });
  assert.equal(await api.request('/me/import-code'), '345EF678');
  assert.equal(local.read(owner).profile.contactCode, '345EF678');
});
test('pending publication cannot be presented as private or successfully synced', async () => {
  seed(); const data = local.read(owner); data.profile.publicationStatus = 'pending'; local.write(owner, data);
  const page = pageFor('me'); await page.load();
  assert.match(page.data.publication?.title || '', /待确认/);
  assert.equal(page.data.publication.retry, true);
});
test('current avatar file size is separate from app-wide cache capacity', async () => {
  seed(); const data = local.read(owner); data.profile.avatarUrl = 'wxfile://fixture-avatar'; local.write(owner, data);
  global.wx.getFileSystemManager = () => ({ getFileInfo: o => o.success({ size: 2048 }) });
  const page = pageFor('me'); await page.load();
  assert.equal(page.data.avatarSizeLabel, '2.0 KB');
});
test('backup generation records owner-specific history; failed sharing can retry the same file', async () => {
  seed(); shareFails = true;
  const page = pageFor('data-backup', {}, { create: async () => 'encrypted fixture' });
  page.data.exportPassword = page.data.exportPasswordConfirm = 'password for testing';
  await page.exportData();
  assert.equal(page.data.exportReady, true);
  assert.equal(page.data.history.length, 1);
  assert.equal(page.data.history[0].shared, false);
  const written = writes[0].filePath;
  shareFails = false; await page.retryShare();
  assert.equal(writes.length, 1);
  assert.equal(shares[1].filePath, written);
  assert.equal(page.data.history[0].shared, true);
});
test('backup sharing uses unique names but reuses one temporary file per account', async () => {
  seed();
  const page = pageFor('data-backup', {}, { create: async () => 'encrypted fixture' });
  page.data.exportPassword = page.data.exportPasswordConfirm = 'password for testing'; await page.exportData();
  page.data.exportPassword = page.data.exportPasswordConfirm = 'password for testing'; await page.exportData();
  assert.notEqual(shares[0].fileName, shares[1].fileName);
  assert.equal(writes[0].filePath, writes[1].filePath, 'temporary exports must not grow without a bound');
  const me = pageFor('me'); await me.load();
  assert.match(me.data.storageLabel || '', /0.5.*10/);
});
test('an old profile response cannot appear after the active account changes', async () => {
  seed(); let finish;
  const profile = local.read(owner).profile;
  const page = pageFor('me', { request: () => new Promise(resolve => { finish = resolve; }) });
  const loading = page.load(); store.set('ai-network-owner-id', 'another-account');
  finish(profile); await loading;
  assert.equal(page.data.profile, null);
});
test('avatar selection is a preview until explicitly confirmed', async () => {
  seed(); let saved = 0;
  global.wx.getImageInfo = options => options.success({ width: 1024, height: 1024 });
  global.wx.compressImage = options => options.success({ tempFilePath: 'wxfile://compressed-avatar' });
  global.wx.getFileSystemManager = () => ({ getFileInfo: o => o.success({ size: 1024 }) });
  const page = pageFor('me', { uploadAvatar: async () => { saved++; return local.read(owner).profile; } });
  await page.load();
  assert.equal(typeof page.onAvatarChosen, 'function');
  await page.onAvatarChosen({ detail: { avatarUrl: 'wxfile://selected-avatar' } });
  assert.equal(saved, 0);
  assert.equal(page.data.avatarPreview, 'wxfile://compressed-avatar');
  await page.saveAvatar();
  assert.equal(saved, 1);
  assert.equal(page.data.avatarPreview, '');
});

test('switching accounts cannot leave the previous import code visible after a failed reload', async () => {
  seed(); const data = local.read(owner); data.profile.contactCode = '234CD567'; local.write(owner, data);
  let failed = false;
  const page = pageFor('settings-friends', { request: p => failed ? Promise.reject(new Error('新账号读取失败')) : p === '/me/import-code' ? Promise.reject(new Error('离线')) : api.request(p) });
  await page.load(); assert.equal(page.data.contactCode, '234CD567');
  store.set('ai-network-owner-id', 'another-account'); failed = true;
  await page.load();
  assert.equal(page.data.contactCode, '');
  assert.equal(page.data.profile, null);
});

const accountState = require('../miniprogram/utils/account-state');
const DAY = 24 * 60 * 60 * 1000;
const record = (createdAt, shared) => ({ fileName: `aimap-backup-${createdAt}-1.aimap`, createdAt, contacts: 1, relationships: 0, bytes: 10, shared });

test('a backup is not generated when the confirmation password differs', async () => {
  seed(); let created = 0;
  const page = pageFor('data-backup', {}, { create: async () => { created++; return 'encrypted fixture'; } });
  page.data.exportPassword = 'password for testing';
  page.data.exportPasswordConfirm = 'password for testinh';
  await page.exportData();
  assert.equal(created, 0);
  assert.match(String(errors[0]?.message), /不一致/);
});

test('backup status asks for a backup until the latest data is in a shared file', () => {
  seed();
  local.handle(owner, '/contacts', 'POST', { name: '甲' });
  const changed = local.changedAt(owner);
  assert.ok(changed > 0, 'every save records when the data changed');
  assert.match(accountState.backupStatus(owner, 1).backupWarning, /还没有备份/);

  accountState.rememberBackup(owner, record(changed + 1000, false));
  let status = accountState.backupStatus(owner, 1);
  assert.equal(status.backupUnsaved, true);
  assert.match(status.backupWarning, /还没有分享保存/);

  accountState.rememberBackup(owner, record(changed + 1000, true));
  status = accountState.backupStatus(owner, 1, changed + 2000);
  assert.equal(status.backupWarning, '');
  assert.equal(status.lastBackup, '刚刚');
  assert.match(accountState.backupStatus(owner, 1, changed + 31 * DAY).backupWarning, /30 天/);

  local.handle(owner, '/contacts', 'POST', { name: '乙' });
  store.set(`ai-network-data-changed:${owner}`, changed + 5000);
  assert.match(accountState.backupStatus(owner, 2, changed + 6000).backupWarning, /有改动/);
});

test('reopening the backup page can share the latest unshared file again', async () => {
  seed(); shareFails = true;
  const first = pageFor('data-backup', {}, { create: async () => 'encrypted fixture' });
  first.data.exportPassword = first.data.exportPasswordConfirm = 'password for testing';
  await first.exportData();
  const written = writes[0].filePath;
  global.wx.getFileSystemManager = () => ({ accessSync: path => { if (path !== written) throw new Error('missing'); } });
  shareFails = false;
  const reopened = pageFor('data-backup');
  await reopened.onShow();
  assert.equal(reopened.data.exportReady, true);
  assert.equal(reopened.data.backupUnsaved, true);
  await reopened.retryShare();
  assert.equal(shares.at(-1).filePath, written);
  assert.equal(reopened.data.backupUnsaved, false);

  global.wx.getFileSystemManager = () => ({ accessSync() { throw new Error('missing'); } });
  accountState.rememberBackup(owner, record(Date.now() + 1, false));
  const missing = pageFor('data-backup');
  await missing.onShow();
  assert.equal(missing.data.exportReady, false, 'a vanished file is not offered for sharing');
});

test('the import code page manages which fields are public', async () => {
  seed(); let patched;
  const page = pageFor('settings-friends', { request: (p, method, body) => {
    if (p === '/me/import-code') return Promise.resolve('234CD567');
    if (p === '/me/visibility') { patched = body; return Promise.resolve({ ...local.read(owner).profile, visibility: body }); }
    return api.request(p);
  } });
  await page.load();
  assert.deepEqual(Array.from(page.data.visibilityItems, item => item.field), ['nickname', 'organization', 'position', 'city', 'bio']);
  page.changeVisibility({ currentTarget: { dataset: { field: 'city' } }, detail: { value: true } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(patched.city, true);
  assert.equal(page.data.visibilityItems.find(item => item.field === 'city').enabled, true);
  assert.equal(page.data.savingVisibility, false);
});

test('settings entries use one name per page and the Me page has no duplicate entries', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '../miniprogram/pages', file), 'utf8');
  const titles = { 'settings-friends': '导入码与公开资料', 'settings-security': '账号与安全', 'settings-privacy': '隐私与授权' };
  for (const [page, title] of Object.entries(titles)) {
    assert.equal(JSON.parse(read(`${page}/index.json`)).navigationBarTitleText, title);
    assert.match(read('settings/index.wxml'), new RegExp(`module-name">${title}<`));
    assert.match(read('me/index.wxml'), new RegExp(`<view>${title}</view>`));
  }
  const me = read('me/index.wxml');
  assert.doesNotMatch(me, /publication-card|设置与隐私|<view>个人资料<\/view>/);
  assert.doesNotMatch(read('settings-privacy/index.wxml'), /<switch/);
  assert.match(read('settings-friends/index.wxml'), /bindchange="changeVisibility"/);
  assert.doesNotMatch(read('settings/index.js'), /settings-profile/);
});

test('the home page note warns when the data is not safely backed up', async () => {
  seed();
  local.handle(owner, '/contacts', 'POST', { name: '甲' });
  const page = pageFor('index');
  await page.loadDashboard(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.backupWarn, true);
  assert.match(page.data.backupNote, /还没有备份/);
  accountState.rememberBackup(owner, record(Date.now() + 1000, true));
  await page.loadDashboard(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.backupWarn, false);
  assert.match(page.data.backupNote, /上次备份/);
});
