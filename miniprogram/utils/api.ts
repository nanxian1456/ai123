const BASE_URL = "http://127.0.0.1:8080/api";
const TOKEN_KEY = "ai-network-auth-token";
let loginPromise: Promise<string> | null = null;

type Method = "GET" | "POST" | "PATCH" | "DELETE";

function wechatLogin(): Promise<string> { return new Promise((resolve, reject) => wx.login({ success: result => result.code ? resolve(result.code) : reject(new Error("未获取到微信登录凭证")), fail: () => reject(new Error("微信登录失败")) })); }
function backendLogin(code: string): Promise<string> { return new Promise((resolve, reject) => wx.request({ url: `${BASE_URL}/auth/wechat-login`, method: "POST", data: { code }, header: { "content-type": "application/json" }, success: response => response.statusCode >= 200 && response.statusCode < 300 && (response.data as { token?: string }).token ? resolve((response.data as { token: string }).token) : reject(new Error((response.data as { detail?: string }).detail || "登录服务暂不可用")), fail: () => reject(new Error("无法连接登录服务")) })); }

export function ensureSession(force = false): Promise<string> {
  const saved = getStoredToken();
  if (!force && saved) return Promise.resolve(saved);
  if (!loginPromise) loginPromise = wechatLogin().then(backendLogin).then(token => { wx.setStorageSync(TOKEN_KEY, token); return token; }).finally(() => { loginPromise = null; });
  return loginPromise;
}

export function getStoredToken(): string { return (wx.getStorageSync(TOKEN_KEY) as string) || ""; }
export function clearSession(): void { wx.removeStorageSync(TOKEN_KEY); }
export function hasProfileData(profile: any): boolean {
  if (!profile) return false;
  if (profile.profileCompleted) return true;
  return [profile.nickname, profile.organization, profile.position, profile.city, profile.bio, profile.avatarUrl]
    .some(value => typeof value === "string" && value.trim().length > 0);
}
export function validateSession<T>(): Promise<T> {
  const token = getStoredToken();
  if (!token) return Promise.reject(new Error("NO_SESSION"));
  return new Promise<T>((resolve, reject) => wx.request({ url: `${BASE_URL}/me`, method: "GET", header: { Authorization: `Bearer ${token}` }, success: response => {
    if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data as T);
    else { if (response.statusCode === 401) clearSession(); reject(new Error(response.statusCode === 401 ? "SESSION_INVALID" : "SESSION_CHECK_FAILED")); }
  }, fail: () => reject(new Error("SESSION_CHECK_FAILED")) }));
}

export function request<T>(path: string, method: Method = "GET", data?: unknown, retry = true): Promise<T> {
  return ensureSession().then(token => new Promise<T>((resolve, reject) => wx.request({ url: `${BASE_URL}${path}`, method, data, header: { "content-type": "application/json", Authorization: `Bearer ${token}` }, success: response => {
    if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data as T);
    else if (response.statusCode === 401 && retry) { clearSession(); request<T>(path, method, data, false).then(resolve).catch(reject); }
    else reject(new Error((response.data as { detail?: string }).detail || (response.statusCode === 401 ? "登录已失效，请重试" : "请求失败")));
  }, fail: () => reject(new Error("无法连接后端，请确认 Java 服务已启动")) })));
}

export function uploadAvatar<T>(filePath: string): Promise<T> {
  return ensureSession().then(token => new Promise<T>((resolve, reject) => wx.uploadFile({ url: `${BASE_URL}/me/avatar`, filePath, name: "file", header: { Authorization: `Bearer ${token}` }, success: response => {
    let data: T | null = null;
    try { data = JSON.parse(response.data) as T; } catch (_) { data = null; }
    if (response.statusCode >= 200 && response.statusCode < 300 && data) resolve(data);
    else reject(new Error((data as { detail?: string } | null)?.detail || "头像上传失败"));
  }, fail: () => reject(new Error("无法上传头像，请确认 Java 服务已启动")) })));
}

export function showError(error: unknown) { wx.showToast({ title: error instanceof Error ? error.message : "操作失败", icon: "none" }); }
