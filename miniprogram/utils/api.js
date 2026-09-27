const local = require("./local-data");
const BASE_URL = "http://127.0.0.1:8080/api";
const TOKEN_KEY = "ai-network-auth-token";
const OWNER_KEY = "ai-network-owner-id";
const EXPIRY_KEY = "ai-network-token-expires-at";
let loginPromise = null;
let migrationPromise = null;

function getStoredToken() { return wx.getStorageSync(TOKEN_KEY) || ""; }
function getOwnerId() { return wx.getStorageSync(OWNER_KEY) || ""; }
function clearSession() { wx.removeStorageSync(TOKEN_KEY); wx.removeStorageSync(OWNER_KEY); wx.removeStorageSync(EXPIRY_KEY); }
function wechatLogin() {
  return new Promise((resolve, reject) => wx.login({ success: ({ code }) => code ? resolve(code) : reject(new Error("未获取到微信登录凭证")), fail: () => reject(new Error("微信登录失败")) }));
}
function backendRequest(path, method, data, token) {
  return new Promise((resolve, reject) => wx.request({
    url: `${BASE_URL}${path}`, method, data,
    header: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
      else reject(new Error(response.statusCode === 401 ? "SESSION_INVALID" : ((response.data && response.data.detail) || "服务请求失败")));
    },
    fail: () => reject(new Error("无法连接后端，请确认 Java 服务已启动"))
  }));
}
function saveRemoteAvatar(profile, token) {
  const url = profile && profile.avatarUrl;
  if (!url || !/^https?:\/\//.test(url)) return Promise.resolve(profile);
  return new Promise((resolve, reject) => wx.downloadFile({
    url, header: { Authorization: `Bearer ${token}` },
    success(result) {
      if (result.statusCode !== 200) return reject(new Error("旧头像下载失败，请稍后重试迁移"));
      wx.saveFile({ tempFilePath: result.tempFilePath, success: saved => resolve({ ...profile, avatarUrl: saved.savedFilePath }), fail: () => reject(new Error("旧头像无法保存到手机，请检查存储空间")) });
    },
    fail: () => reject(new Error("旧头像下载失败，请稍后重试迁移"))
  }));
}
function prepareLocal(token, expectedOwner) {
  if (expectedOwner && local.read(expectedOwner)) return Promise.resolve(expectedOwner);
  if (!migrationPromise) migrationPromise = backendRequest("/local-export", "GET", undefined, token)
    .then(exportData => {
      if (!exportData || !exportData.ownerId || (expectedOwner && expectedOwner !== exportData.ownerId)) throw new Error("登录身份与旧数据不一致");
      return saveRemoteAvatar(exportData.profile, token).then(profile => ({ ...exportData, profile }));
    })
    .then(exportData => {
      local.migrate(exportData.ownerId, exportData);
      wx.setStorageSync(OWNER_KEY, exportData.ownerId);
      return exportData.ownerId;
    })
    .finally(() => { migrationPromise = null; });
  return migrationPromise;
}
function ensureSession(force = false) {
  const token = getStoredToken();
  if (!force && token && (!wx.getStorageSync(EXPIRY_KEY) || Date.now() < wx.getStorageSync(EXPIRY_KEY))) return prepareLocal(token, getOwnerId()).then(() => token);
  if (!loginPromise) loginPromise = wechatLogin()
    .then(code => backendRequest("/auth/wechat-login", "POST", { code }))
    .then(session => {
      if (!session.token || !session.ownerId) throw new Error("登录服务未返回用户身份");
      return prepareLocal(session.token, session.ownerId).then(() => {
        wx.setStorageSync(TOKEN_KEY, session.token);
        wx.setStorageSync(OWNER_KEY, session.ownerId);
        wx.setStorageSync(EXPIRY_KEY, Date.now() + Number(session.expiresIn || 0) * 1000);
        return session.token;
      });
    }).finally(() => { loginPromise = null; });
  return loginPromise;
}
function hasProfileData(profile) {
  if (!profile) return false;
  if (profile.profileCompleted) return true;
  return [profile.nickname, profile.organization, profile.position, profile.city, profile.bio, profile.avatarUrl]
    .some(value => typeof value === "string" && value.trim().length > 0);
}
function validateSession() {
  const token = getStoredToken();
  if (!token) return Promise.reject(new Error("NO_SESSION"));
  if (wx.getStorageSync(EXPIRY_KEY) && Date.now() >= wx.getStorageSync(EXPIRY_KEY)) return Promise.reject(new Error("SESSION_INVALID"));
  return prepareLocal(token, getOwnerId()).then(ownerId => local.handle(ownerId, "/me"));
}
function request(path, method = "GET", data) {
  if (path === "/ai/extract") return ensureSession().then(token => backendRequest(path, method, data, token));
  if (path.startsWith("/users/importable/")) return Promise.reject(new Error("本地模式暂不支持跨手机导入码"));
  return ensureSession().then(() => local.handle(getOwnerId(), path, method, data));
}
function uploadAvatar(filePath) {
  return ensureSession().then(() => new Promise((resolve, reject) => wx.saveFile({
    tempFilePath: filePath,
    success(saved) {
      try {
        const ownerId = getOwnerId();
        const data = local.read(ownerId);
        data.profile = { ...data.profile, avatarUrl: saved.savedFilePath };
        local.write(ownerId, data);
        resolve(data.profile);
      } catch (error) { reject(error); }
    },
    fail: () => reject(new Error("头像无法保存到手机，请检查存储空间"))
  })));
}
function showError(error) { wx.showToast({ title: error && error.message ? error.message : "操作失败", icon: "none" }); }
module.exports = { request, ensureSession, validateSession, getStoredToken, clearSession, hasProfileData, uploadAvatar, showError };
