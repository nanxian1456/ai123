const BASE_URL = "http://127.0.0.1:8080/api";
const TOKEN_KEY = "ai-network-auth-token";
let loginPromise = null;

function wechatLogin() {
  return new Promise((resolve, reject) => {
    wx.login({ success: ({ code }) => code ? resolve(code) : reject(new Error("未获取到微信登录凭证")), fail: () => reject(new Error("微信登录失败")) });
  });
}

function backendLogin(code) {
  return new Promise((resolve, reject) => {
    wx.request({ url: `${BASE_URL}/auth/wechat-login`, method: "POST", data: { code }, header: { "content-type": "application/json" }, success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300 && response.data && response.data.token) resolve(response.data.token);
      else reject(new Error((response.data && response.data.detail) || "登录服务暂不可用"));
    }, fail: () => reject(new Error("无法连接登录服务")) });
  });
}

function ensureSession(force = false) {
  const saved = getStoredToken();
  if (!force && saved) return Promise.resolve(saved);
  if (!loginPromise) loginPromise = wechatLogin().then(backendLogin).then((token) => { wx.setStorageSync(TOKEN_KEY, token); return token; }).finally(() => { loginPromise = null; });
  return loginPromise;
}

function getStoredToken() { return wx.getStorageSync(TOKEN_KEY) || ""; }
function clearSession() { wx.removeStorageSync(TOKEN_KEY); }
function hasProfileData(profile) {
  if (!profile) return false;
  if (profile.profileCompleted) return true;
  return [profile.nickname, profile.organization, profile.position, profile.city, profile.bio, profile.avatarUrl]
    .some((value) => typeof value === "string" && value.trim().length > 0);
}

function validateSession() {
  const token = getStoredToken();
  if (!token) return Promise.reject(new Error("NO_SESSION"));
  return new Promise((resolve, reject) => {
    wx.request({ url: `${BASE_URL}/me`, method: "GET", header: { Authorization: `Bearer ${token}` }, success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
      else { if (response.statusCode === 401) clearSession(); reject(new Error(response.statusCode === 401 ? "SESSION_INVALID" : "SESSION_CHECK_FAILED")); }
    }, fail: () => reject(new Error("SESSION_CHECK_FAILED")) });
  });
}

function request(path, method = "GET", data, retry = true) {
  return ensureSession().then((token) => new Promise((resolve, reject) => {
    wx.request({ url: `${BASE_URL}${path}`, method, data, header: { "content-type": "application/json", Authorization: `Bearer ${token}` }, success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
      else if (response.statusCode === 401 && retry) { clearSession(); request(path, method, data, false).then(resolve).catch(reject); }
      else reject(new Error((response.data && response.data.detail) || (response.statusCode === 401 ? "登录已失效，请重试" : "请求失败")));
    }, fail: () => reject(new Error("无法连接后端，请确认 Java 服务已启动")) });
  }));
}

function uploadAvatar(filePath) {
  return ensureSession().then((token) => new Promise((resolve, reject) => {
    wx.uploadFile({ url: `${BASE_URL}/me/avatar`, filePath, name: "file", header: { Authorization: `Bearer ${token}` }, success(response) {
      let data;
      try { data = JSON.parse(response.data); } catch (_) { data = null; }
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(data);
      else reject(new Error((data && data.detail) || "头像上传失败"));
    }, fail: () => reject(new Error("无法上传头像，请确认 Java 服务已启动")) });
  }));
}

function showError(error) { wx.showToast({ title: error && error.message ? error.message : "操作失败", icon: "none" }); }

module.exports = { request, ensureSession, validateSession, getStoredToken, clearSession, hasProfileData, uploadAvatar, showError };
