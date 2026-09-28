import local = require("./local-data");
const BASE_URL = "http://127.0.0.1:8080/api";
const TOKEN_KEY = "ai-network-auth-token";
const OWNER_KEY = "ai-network-owner-id";
const EXPIRY_KEY = "ai-network-token-expires-at";
let loginPromise: Promise<string> | null = null;
let migrationPromise: Promise<string> | null = null;
type Method = "GET" | "POST" | "PATCH" | "DELETE";

export function getStoredToken(): string { return (wx.getStorageSync(TOKEN_KEY) as string) || ""; }
function getOwnerId(): string { return (wx.getStorageSync(OWNER_KEY) as string) || ""; }
export function getCurrentOwnerId(): Promise<string> { return ensureSession().then(() => getOwnerId()); }
export function clearSession(): void { wx.removeStorageSync(TOKEN_KEY); wx.removeStorageSync(OWNER_KEY); wx.removeStorageSync(EXPIRY_KEY); }
function wechatLogin(): Promise<string> {
  return new Promise((resolve, reject) => wx.login({ success: ({ code }) => code ? resolve(code) : reject(new Error("未获取到微信登录凭证")), fail: () => reject(new Error("微信登录失败")) }));
}
function backendRequest<T = any>(path: string, method: Method, data?: unknown, token?: string): Promise<T> {
  return new Promise((resolve, reject) => wx.request({
    url: `${BASE_URL}${path}`, method: method as any, data,
    header: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data as T);
      else reject(new Error(response.statusCode === 401 ? "SESSION_INVALID" : ((response.data as any)?.detail || "服务请求失败")));
    },
    fail: () => reject(new Error("无法连接后端，请确认 Java 服务已启动"))
  }));
}
function saveRemoteAvatar(profile: any, token: string): Promise<any> {
  const url = profile?.avatarUrl;
  if (!url || !/^https?:\/\//.test(url)) return Promise.resolve(profile);
  return new Promise((resolve, reject) => wx.downloadFile({
    url, header: { Authorization: `Bearer ${token}` },
    success(result) {
      if (result.statusCode !== 200) return reject(new Error("旧头像下载失败，请稍后重试迁移"));
      wx.getFileSystemManager().saveFile({ tempFilePath: result.tempFilePath, success: saved => resolve({ ...profile, avatarUrl: saved.savedFilePath }), fail: () => reject(new Error("旧头像无法保存到手机，请检查存储空间")) });
    }, fail: () => reject(new Error("旧头像下载失败，请稍后重试迁移"))
  }));
}
function prepareLocal(token: string, expectedOwner: string): Promise<string> {
  if (expectedOwner && local.read(expectedOwner)) return Promise.resolve(expectedOwner);
  if (!migrationPromise) migrationPromise = backendRequest<any>("/local-export", "GET", undefined, token)
    .then(exportData => {
      if (!exportData?.ownerId || (expectedOwner && expectedOwner !== exportData.ownerId)) throw new Error("登录身份与旧数据不一致");
      return saveRemoteAvatar(exportData.profile, token).then(profile => ({ ...exportData, profile }));
    })
    .then(exportData => {
      local.migrate(exportData.ownerId, exportData);
      wx.setStorageSync(OWNER_KEY, exportData.ownerId);
      return exportData.ownerId;
    }).finally(() => { migrationPromise = null; });
  return migrationPromise;
}
export function ensureSession(force = false): Promise<string> {
  const token = getStoredToken();
  if (!force && token && (!wx.getStorageSync(EXPIRY_KEY) || Date.now() < wx.getStorageSync(EXPIRY_KEY))) return prepareLocal(token, getOwnerId()).then(() => token);
  if (!loginPromise) loginPromise = wechatLogin()
    .then(code => backendRequest<any>("/auth/wechat-login", "POST", { code }))
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
export function hasProfileData(profile: any): boolean {
  if (!profile) return false;
  if (profile.profileCompleted) return true;
  return [profile.nickname, profile.organization, profile.position, profile.city, profile.bio, profile.avatarUrl]
    .some(value => typeof value === "string" && value.trim().length > 0);
}
export function validateSession<T>(): Promise<T> {
  const token = getStoredToken();
  if (!token) return Promise.reject(new Error("NO_SESSION"));
  if (wx.getStorageSync(EXPIRY_KEY) && Date.now() >= wx.getStorageSync(EXPIRY_KEY)) return Promise.reject(new Error("SESSION_INVALID"));
  return prepareLocal(token, getOwnerId()).then(ownerId => local.handle(ownerId, "/me") as T);
}
export function request<T>(path: string, method: Method = "GET", data?: unknown): Promise<T> {
  if (path === "/ai/extract") return ensureSession().then(token => backendRequest<T>(path, method, data, token));
  if (path === "/me/import-code") return ensureSession().then(token => backendRequest<any>("/me", "GET", undefined, token).then(profile => profile.contactCode as T));
  if (path.startsWith("/users/importable/")) return ensureSession().then(token => backendRequest<T>(path, method, data, token));
  return ensureSession().then(token => {
    const ownerId = getOwnerId();
    if (method !== "PATCH" || (path !== "/me" && path !== "/me/visibility")) return local.handle(ownerId, path, method, data) as T;
    const previous = JSON.parse(JSON.stringify(local.read(ownerId)));
    let result: any;
    try { result = local.handle(ownerId, path, method, data); } catch (error) { return Promise.reject(error); }
    if (!previous.profile.visibility.nickname && !result.visibility.nickname) return result as T;
    return backendRequest("/me/published-profile", "PATCH", publishedPayload(result), token)
      .then(() => result as T, error => { local.write(ownerId, previous); throw error; });
  });
}
function publishedPayload(profile: any) {
  const visibility = profile.visibility || {};
  return { published: Boolean(visibility.nickname && profile.nickname), nickname: visibility.nickname ? profile.nickname : "",
    organization: visibility.organization ? profile.organization : "", position: visibility.position ? profile.position : "",
    city: visibility.city ? profile.city : "", bio: visibility.bio ? profile.bio : "" };
}
export function syncPublishedProfile(profile: any): Promise<void> {
  return ensureSession().then(token => backendRequest<void>("/me/published-profile", "PATCH", publishedPayload(profile), token));
}
export function recognizeCard<T>(filePath: string): Promise<T> {
  return ensureSession().then(token => new Promise<T>((resolve, reject) => wx.uploadFile({
    url: `${BASE_URL}/ai/recognize-card`, filePath, name: "file", header: { Authorization: `Bearer ${token}` },
    success(response) {
      let data: any;
      try { data = JSON.parse(response.data); } catch (_) { return reject(new Error("图片识别结果无效")); }
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(data as T);
      else reject(new Error(data.detail || data.message || "图片识别失败"));
    }, fail: () => reject(new Error("无法连接图片识别服务"))
  })));
}
export function uploadAvatar<T>(filePath: string): Promise<T> {
  return ensureSession().then(() => new Promise<T>((resolve, reject) => wx.getFileSystemManager().saveFile({
    tempFilePath: filePath,
    success(saved) {
      try {
        const ownerId = getOwnerId();
        const data = local.read(ownerId);
        data.profile = { ...data.profile, avatarUrl: saved.savedFilePath };
        local.write(ownerId, data);
        resolve(data.profile as T);
      } catch (error) { reject(error); }
    }, fail: () => reject(new Error("头像无法保存到手机，请检查存储空间"))
  })));
}
export function showError(error: unknown) { wx.showToast({ title: error instanceof Error ? error.message : "操作失败", icon: "none" }); }
