const test = require('node:test');
const assert = require('node:assert/strict');
const store = new Map();
let response, failure, sent;
const modals = [], toasts = [];
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ''),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  login: options => options.success({ code: 'one-use-code' }),
  request(options) { sent = options; failure ? options.fail(failure) : options.success(response); },
  showModal: options => modals.push(options),
  showToast: options => toasts.push(options)
};
const local = require('../miniprogram/utils/local-data');
const api = require('../miniprogram/utils/api');
function seed() {
  store.clear(); modals.length = 0; toasts.length = 0; failure = null;
  local.migrate('errors-owner', { ownerId: 'errors-owner', contacts: [], relationships: [] });
  store.set('ai-network-owner-id', 'errors-owner');
  store.set('ai-network-auth-token', 'valid-token');
  store.set('ai-network-token-expires-at', Date.now() + 60000);
}
test('login code rejection keeps its actionable reason instead of reporting an expired session', async () => {
  seed();
  response = { statusCode: 401, data: { code: 'WECHAT_CODE_INVALID', message: '微信登录凭证已失效，请重新点击登录', requestId: 'trace-123' } };
  await assert.rejects(api.ensureSession(true), error => {
    assert.match(error.message, /重新点击登录/);
    assert.equal(error.code, 'WECHAT_CODE_INVALID');
    assert.equal(error.requestId, 'trace-123');
    return true;
  });
  assert.equal(api.getStoredToken(), 'valid-token');
});
test('authenticated 401 clears only the token and leaves local contacts usable', async () => {
  seed(); response = { statusCode: 401, data: { message: 'Unauthorized' } };
  await assert.rejects(api.request('/maps/locations'), error => error.code === 'SESSION_INVALID');
  assert.equal(api.getStoredToken(), '');
  assert.deepEqual(await api.request('/contacts'), []);
  assert.equal(store.get('ai-network-owner-id'), 'errors-owner');
});
test('timeouts are finite and explain that local data remains usable', async () => {
  seed(); failure = { errMsg: 'request:fail timeout' };
  await assert.rejects(api.request('/maps/locations'), error => {
    assert.equal(error.code, 'REQUEST_TIMEOUT');
    assert.match(error.message, /超时/); assert.match(error.message, /本机/);
    assert.equal(error.ambiguous, true); return true;
  });
  assert.ok(sent.timeout > 0 && sent.timeout <= 60000);
});
test('long errors use a readable dialog with a support reference; short errors use a toast', () => {
  seed(); const error = Object.assign(new Error('微信登录配置有误，请联系开发者检查后端 AppID 与 AppSecret 配置'), { requestId: 'trace-123' });
  api.showError(error);
  assert.equal(modals.length, 1); assert.match(modals[0].content, /AppSecret/);
  assert.match(modals[0].content, /trace-123/); assert.equal(modals[0].showCancel, false);
  api.showError(new Error('请输入姓名')); assert.equal(toasts.at(-1).title, '请输入姓名');
});
