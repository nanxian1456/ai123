import local = require("./local-data");
import { getApiBaseUrl } from "./api-config";
import { forgetBackupHistory } from "./account-state";
import { forgetAccountConsent } from "./consent";
const TOKEN_KEY = "ai-network-auth-token";
const OWNER_KEY = "ai-network-owner-id";
const EXPIRY_KEY = "ai-network-token-expires-at";
let loginPromise: Promise<string> | null = null;
let migrationPromise: Promise<string> | null = null;
interface RequestError extends Error {
  code?: string;
  requestId?: string;
  statusCode?: number;
  ambiguous?: boolean;
}
const publicationQueues = new Map<string, Promise<unknown>>();
function asRequestError(error: unknown): RequestError {
  return error instanceof Error ? error : new Error("服务请求失败");
}
function sessionError(): RequestError {
  const error: RequestError = new Error(
    "登录已过期，请联网后重新登录；本机资料仍可使用",
  );
  error.code = "SESSION_INVALID";
  return error;
}
function cachedOwner() {
  const ownerId = getOwnerId();
  return ownerId && local.read(ownerId) ? ownerId : "";
}
function requireLocalData(ownerId: string) {
  const data = local.read(ownerId);
  if (!data) throw new Error("本机数据尚未初始化，请重新登录");
  return data;
}
async function localOwner(): Promise<string> {
  if (getPendingAccountDeletion()) throw new Error("账号注销后本机清理尚未完成，请先进入账号安全页继续清理");
  const ownerId = cachedOwner();
  return ownerId || ensureSession().then(() => getOwnerId());
}
function serializePublication<T>(
  ownerId: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = publicationQueues.get(ownerId) || Promise.resolve();
  const operation = previous.catch(() => {}).then(task);
  publicationQueues.set(ownerId, operation);
  operation.then(
    () => {
      if (publicationQueues.get(ownerId) === operation)
        publicationQueues.delete(ownerId);
    },
    () => {
      if (publicationQueues.get(ownerId) === operation)
        publicationQueues.delete(ownerId);
    },
  );
  return operation;
}
function publicationStatus(
  ownerId: string,
  status: "pending" | "synced" | "error",
): void {
  const current = local.read(ownerId);
  if (current) {
    current.profile.publicationStatus = status;
    if (status === "synced") current.profile.publicationSyncedAt = Date.now();
    local.write(ownerId, current);
  }
}

export function getStoredToken(): string {
  return wx.getStorageSync(TOKEN_KEY) || "";
}
function getOwnerId(): string {
  return wx.getStorageSync(OWNER_KEY) || "";
}
export function getCurrentOwnerId() {
  return localOwner();
}
const deletionKey = (owner: string) => `ai-network-deletion-confirmed:${owner}`;
export function getPendingAccountDeletion(): string {
  const owner = getOwnerId();
  if (!owner) return "";
  const marker = wx.getStorageSync(deletionKey(owner));
  return marker?.ownerId === owner && (marker.confirmed === true || marker.requested === true) ? owner : "";
}
async function deleteLocalAvatar(path: string): Promise<void> {
  if (!path || /^https?:\/\//i.test(path)) return;
  await new Promise<void>((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    const userData = wx.env?.USER_DATA_PATH || "";
    const options = { filePath: path, success: () => resolve(), fail: (error: any) => {
      if (/no such file|not exist/i.test(error?.errMsg || "")) resolve();
      else reject(new Error("服务器账号已注销，头像文件清理未完成，请继续清理本机数据"));
    } };
    if (userData && path.startsWith(`${userData}/`)) fs.unlink(options);
    else fs.removeSavedFile(options);
  });
}
export async function deleteAccount(ownerId: string): Promise<void> {
  if (!ownerId || ownerId !== getOwnerId()) throw new Error("账号已切换，请重新进入账号安全页");
  let journal = wx.getStorageSync(deletionKey(ownerId));
  const existing = journal?.ownerId === ownerId && (journal.confirmed || journal.requested);
  if (!existing) {
    const operationId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const n = Math.floor(Math.random() * 16); return (c === "x" ? n : (n & 3) | 8).toString(16);
    });
    journal = { ownerId, operationId, requested: true, confirmed: false };
    // Reserve the recovery journal before a destructive server request.
    wx.setStorageSync(deletionKey(ownerId), journal);
    if (wx.getStorageSync(deletionKey(ownerId))?.operationId !== operationId) throw new Error("注销恢复记录无法保存，请先释放存储空间");
  }
  if (!journal.confirmed) {
    if (existing) {
      const status = await backendRequest("/auth/account-deletion-status", "POST", { code: await wechatLogin(), operationId: journal.operationId });
      if (status?.ownerId !== ownerId || getOwnerId() !== ownerId) throw new Error("微信身份已变化，请回原账号确认注销结果");
      journal.confirmed = status.confirmed === true;
    }
    if (!journal.confirmed) {
      let submitted = false;
      try {
        const token = await ensureSession(true, true);
        if (getOwnerId() !== ownerId) throw new Error("微信身份已变化，本机资料已保留");
        const code = await wechatLogin();
        submitted = true;
        const result = await backendRequest("/me/account", "DELETE", { code, confirmation: "注销", operationId: journal.operationId }, token);
        if (result?.status !== "deleted" || result?.ownerId !== ownerId || getOwnerId() !== ownerId) throw new Error("注销结果无法确认，本机资料已保留，请重试");
        journal.confirmed = true;
      } catch (error) {
        // A new attempt that never reached deletion cannot have changed the server account.
        if (!submitted && !existing) { try { wx.removeStorageSync(deletionKey(ownerId)); } catch (_) { } }
        throw error;
      }
    }
    try { wx.setStorageSync(deletionKey(ownerId), journal); }
    catch (_) { throw new Error("服务器已确认注销，但本机确认记录未保存；请释放空间后继续确认并清理"); }
  }
  const data = local.read(ownerId);
  await deleteLocalAvatar(data?.profile?.avatarUrl || "");
  if (getOwnerId() !== ownerId) throw new Error("账号已切换，请返回原账号继续清理");
  local.write(ownerId, null);
  // Only keys in this owner's exact namespace are eligible for cleanup.
  const keys = wx.getStorageInfoSync().keys;
  const shardPrefix = `ai-network-local-shards-v1:${encodeURIComponent(ownerId)}:shard:`;
  const legacyPrefix = `${local.key(ownerId)}:g`;
  for (const key of keys) {
    if (key.startsWith(shardPrefix) || (key.startsWith(legacyPrefix) && /^\d+:/.test(key.slice(legacyPrefix.length)))) wx.removeStorageSync(key);
  }
  forgetBackupHistory(ownerId);
  wx.removeStorageSync(`ai-network-recent-countries:${ownerId}`);
  wx.removeStorageSync("contact-filter-region"); wx.removeStorageSync("contact-filter-city");
  const categoryEntry = wx.getStorageSync("graph-category-entry");
  if (categoryEntry?.ownerId === ownerId) wx.removeStorageSync("graph-category-entry");
  forgetAccountConsent(ownerId);
  wx.removeStorageSync(deletionKey(ownerId));
  clearSession();
}
async function freshIdentityAction(path: string, confirmation: string) {
  const ownerId = await localOwner();
  const token = await ensureSession(true);
  if (ownerId !== getOwnerId()) throw new Error("账号已切换，请重新操作");
  const result = await backendRequest(path, "POST", { code: await wechatLogin(), confirmation }, token);
  if (ownerId !== getOwnerId()) throw new Error("账号已切换，请返回原账号确认结果");
  return { ownerId, result };
}
export async function revokeAllSessions(): Promise<void> {
  const { ownerId, result } = await freshIdentityAction("/me/sessions/revoke", "退出全部");
  if (result?.status !== "revoked" || result?.ownerId !== ownerId) throw new Error("退出结果尚未确认，请重试");
  clearSession();
}
export async function resetImportCode(): Promise<string> {
  const { ownerId, result } = await freshIdentityAction("/me/import-code/reset", "重置");
  const code = result?.contactCode;
  if (!/^\d{3}[A-Z]{2}\d{3}$/.test(code || "")) throw new Error("重置结果无法确认，请重新获取导入码");
  try { const current = requireLocalData(ownerId); current.profile.contactCode = code; local.write(ownerId, current); }
  catch (_) { throw new Error("导入码已重置，但本机缓存未更新，请重新获取"); }
  return code;
}
export function clearSession() {
  wx.removeStorageSync(TOKEN_KEY);
  if (!getPendingAccountDeletion()) wx.removeStorageSync(OWNER_KEY);
  wx.removeStorageSync(EXPIRY_KEY);
}
function wechatLogin(): Promise<string> {
  return new Promise<string>((resolve, reject) =>
    wx.login({
      success: (result) => {
        if (result.code) return resolve(result.code);
        const error: RequestError = new Error(`微信未返回登录凭证（${result.errMsg || "无错误详情"}）`);
        error.code = "WECHAT_LOGIN_FAILED";
        reject(error);
      },
      fail: (result) => {
        const error: RequestError = new Error(`微信登录调用失败（${result.errMsg || "无错误详情"}）`);
        error.code = "WECHAT_LOGIN_FAILED";
        reject(error);
      },
    }),
  );
}
function backendRequest<T = any>(
  path: string,
  method: string,
  data?: any,
  token?: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) =>
    wx.request({
      url: `${getApiBaseUrl()}${path}`,
      method: method as any,
      timeout: path === "/ai/extract" ? 60000 : 20000,
      data,
      header: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300)
          resolve(response.data as T);
        else {
          const invalidSession = response.statusCode === 401 && !!token;
          if (invalidSession && token === getStoredToken()) {
            wx.removeStorageSync(TOKEN_KEY);
            wx.removeStorageSync(EXPIRY_KEY);
          }
          const body: Record<string, unknown> =
            response.data && typeof response.data === "object"
              ? (response.data as Record<string, unknown>)
              : {};
          const fields =
            body.fieldErrors && typeof body.fieldErrors === "object"
              ? Object.values(body.fieldErrors).filter(
                  (value) => typeof value === "string",
                )
              : [];
          const error: RequestError =
            invalidSession
              ? sessionError()
              : new Error(
                  [
                    typeof body.message === "string"
                      ? body.message
                      : response.statusCode === 429
                        ? "操作太频繁，请稍后重试"
                        : "服务暂不可用，请稍后重试；本机资料仍可使用",
                    ...fields,
                  ].join("；"),
                );
          error.statusCode = response.statusCode;
          if (!invalidSession && typeof body.code === "string") error.code = body.code;
          if (typeof body.requestId === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(body.requestId))
            error.requestId = body.requestId;
          error.ambiguous = response.statusCode >= 500;
          reject(error);
        }
      },
      fail: (failure) => {
        const timedOut = /timeout/i.test(failure?.errMsg || "");
        const error: RequestError = new Error(timedOut
          ? "请求超时，请稍后重试；本机资料仍可使用"
          : "无法连接后端，请检查网络和后端是否启动；本机资料仍可使用");
        error.code = timedOut ? "REQUEST_TIMEOUT" : "NETWORK_UNAVAILABLE";
        error.ambiguous = true;
        reject(error);
      },
    }),
  );
}
function saveRemoteAvatar(profile: any, token: string): Promise<any> {
  const url = profile && profile.avatarUrl;
  if (!url || !/^https?:\/\//.test(url)) return Promise.resolve(profile);
  return new Promise((resolve, reject) =>
    wx.downloadFile({
      url,
      header: { Authorization: `Bearer ${token}` },
      success(result) {
        if (result.statusCode !== 200)
          return reject(new Error("旧头像下载失败，请稍后重试迁移"));
        wx.getFileSystemManager().saveFile({
          tempFilePath: result.tempFilePath,
          success: (saved) =>
            resolve({ ...profile, avatarUrl: saved.savedFilePath }),
          fail: () => reject(new Error("旧头像无法保存到手机，请检查存储空间")),
        });
      },
      fail: () => reject(new Error("旧头像下载失败，请稍后重试迁移")),
    }),
  );
}
function prepareLocal(token: string, expectedOwner: string): Promise<string> {
  if (expectedOwner && local.read(expectedOwner))
    return Promise.resolve(expectedOwner);
  if (!migrationPromise)
    migrationPromise = backendRequest("/local-export", "GET", undefined, token)
      .then((exportData) => {
        if (
          !exportData ||
          !exportData.ownerId ||
          (expectedOwner && expectedOwner !== exportData.ownerId)
        )
          throw new Error("登录身份与旧数据不一致");
        return saveRemoteAvatar(exportData.profile, token).then((profile) => ({
          ...exportData,
          profile,
        }));
      })
      .then((exportData) => {
        local.migrate(exportData.ownerId, exportData);
        wx.setStorageSync(OWNER_KEY, exportData.ownerId);
        return exportData.ownerId;
      })
      .finally(() => {
        migrationPromise = null;
      });
  return migrationPromise;
}
export async function ensureSession(force = false, deletionRecovery = false): Promise<string> {
  if (getPendingAccountDeletion() && !deletionRecovery) throw new Error("注销确认或本机清理尚未完成，请返回账号安全页继续处理");
  const token = getStoredToken();
  if (
    !force &&
    token &&
    (!wx.getStorageSync(EXPIRY_KEY) ||
      Date.now() < wx.getStorageSync(EXPIRY_KEY))
  )
    return prepareLocal(token, getOwnerId()).then(() => token);
  if (!loginPromise)
    loginPromise = wechatLogin()
      .then((code) => backendRequest("/auth/wechat-login", "POST", { code }))
      .then((session) => {
        if (!session.token || !session.ownerId)
          throw new Error("登录服务未返回用户身份");
        return prepareLocal(session.token, session.ownerId).then(() => {
          wx.setStorageSync(TOKEN_KEY, session.token);
          wx.setStorageSync(OWNER_KEY, session.ownerId);
          wx.setStorageSync(
            EXPIRY_KEY,
            Date.now() + Number(session.expiresIn || 0) * 1000,
          );
          return session.token;
        });
      })
      .finally(() => {
        loginPromise = null;
      });
  return loginPromise;
}
export function hasProfileData(profile: any): boolean {
  if (!profile) return false;
  if (profile.profileCompleted) return true;
  return [
    profile.nickname,
    profile.organization,
    profile.position,
    profile.city,
    profile.bio,
    profile.avatarUrl,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
}
export async function validateSession<T = any>(): Promise<T> {
  if (getPendingAccountDeletion()) throw new Error("账号注销后本机清理尚未完成，请返回入口继续清理");
  const ownerId = cachedOwner();
  if (ownerId) return Promise.resolve(local.handle(ownerId, "/me"));
  const token = getStoredToken();
  if (!token) return Promise.reject(new Error("NO_SESSION"));
  if (
    wx.getStorageSync(EXPIRY_KEY) &&
    Date.now() >= wx.getStorageSync(EXPIRY_KEY)
  )
    return Promise.reject(sessionError());
  return prepareLocal(token, getOwnerId()).then((ownerId) =>
    local.handle(ownerId, "/me"),
  );
}
export function request<T = any>(
  path: string,
  method = "GET",
  data?: any,
): Promise<T> {
  if (path === "/me/published-profile" && method === "GET") {
    const owner = getOwnerId();
    return ensureSession().then(async token => {
      if (owner !== getOwnerId()) throw new Error("账号已切换，请重新预览");
      const result = await backendRequest<T>(path, "GET", undefined, token);
      if (owner !== getOwnerId()) throw new Error("账号已切换，请重新预览");
      return result;
    });
  }
  if (path === "/ai/extract")
    return ensureSession().then((token) =>
      backendRequest(path, method, data, token),
    );
  if (path.split("?", 1)[0] === "/maps/locations")
    return ensureSession().then((token) =>
      backendRequest(path, method, data, token),
    );
  if (path === "/me/import-code")
    return ensureSession().then(async token => {
      const ownerId = getOwnerId();
      const profile = await backendRequest("/me", "GET", undefined, token);
      if (getOwnerId() !== ownerId) throw new Error("账号已切换，请重新获取导入码");
      const code = profile.contactCode;
      if (!/^\d{3}[A-Z]{2}\d{3}$/.test(code || "")) throw new Error("服务未返回有效导入码");
      const current = requireLocalData(ownerId);
      if (current.profile.contactCode !== code) { current.profile.contactCode = code; local.write(ownerId, current); }
      return code;
    });
  if (path.startsWith("/users/importable/"))
    return ensureSession().then((token) =>
      backendRequest(path, method, data, token),
    );
  let replacedAvatar = "";
  return localOwner().then((ownerId) => {
    if (ownerId !== getOwnerId()) throw new Error("账号已切换，原操作已取消，请重新操作");
    if (path === "/me" && method === "PATCH" && data?.resetAvatar === true) replacedAvatar = requireLocalData(ownerId).profile.avatarUrl || "";
    if (method !== "PATCH" || (path !== "/me" && path !== "/me/visibility"))
      return local.handle(ownerId, path, method, data);
    return serializePublication(ownerId, async () => {
      const previous = requireLocalData(ownerId).profile;
      let result;
      try {
        result = local.handle(ownerId, path, method, data);
      } catch (error) {
        return Promise.reject(error);
      }
      if (
        !previous.visibility.nickname &&
        !result.visibility.nickname &&
        previous.publicationStatus !== "pending"
      )
        return result;
      let remoteAcknowledged = false;
      try {
        publicationStatus(ownerId, "pending");
        const token = await ensureSession();
        if (getOwnerId() !== ownerId)
          throw new Error("登录账号已变化，请切换回原账号后同步");
        await backendRequest(
          "/me/published-profile",
          "PATCH",
          publishedPayload(result),
          token,
        );
        remoteAcknowledged = true;
        confirmPublication(ownerId, publishedPayload(result));
        return requireLocalData(ownerId).profile;
      } catch (caught) {
        const error = asRequestError(caught);
        if (remoteAcknowledged) error.ambiguous = true;
        if (!error.ambiguous) {
          const current = requireLocalData(ownerId);
          for (const field of Object.keys(result)) {
            if (
              field !== "publicationStatus" &&
              JSON.stringify(previous[field]) !==
                JSON.stringify(result[field]) &&
              JSON.stringify(current.profile[field]) ===
                JSON.stringify(result[field])
            )
              current.profile[field] = previous[field];
          }
          current.profile.publicationStatus =
            previous.publicationStatus === "pending" ? "pending" : "error";
          local.write(ownerId, current);
        } else {
          preservePendingStatus(ownerId);
          error.message +=
            "；公开状态尚未确认，请联网后重新同步，当前设置不代表服务端已生效";
        }
        throw error;
      }
    });
  }).then(result => {
    if (replacedAvatar && result && !result.avatarUrl) removeLocalFile(replacedAvatar);
    return result;
  });
}
function confirmPublication(ownerId: string, attempted: any) {
  if (
    JSON.stringify(publishedPayload(requireLocalData(ownerId).profile)) !==
    JSON.stringify(attempted)
  ) {
    const error: RequestError = new Error("本机公开资料已变化，请重新同步");
    error.ambiguous = true;
    throw error;
  }
  try {
    publicationStatus(ownerId, "synced");
  } catch (caught) {
    const error: RequestError =
      caught instanceof Error ? caught : new Error("同步状态无法保存");
    // The server has acknowledged the mutation. A storage failure cannot undo it.
    error.ambiguous = true;
    throw error;
  }
}
function preservePendingStatus(ownerId: string): void {
  try { publicationStatus(ownerId, "pending"); }
  catch (_) { /* Keep the original ambiguous result when local storage is unavailable. */ }
}
function publishedPayload(profile: any) {
  const visibility = profile.visibility || {};
  return {
    published: Boolean(visibility.nickname && profile.nickname),
    nickname: visibility.nickname ? profile.nickname : "",
    organization: visibility.organization ? profile.organization : "",
    position: visibility.position ? profile.position : "",
    city: visibility.city ? profile.city : "",
    bio: visibility.bio ? profile.bio : "",
  };
}
export function syncPublishedProfile(profile: any): Promise<void> {
  if (getPendingAccountDeletion()) return Promise.reject(new Error("注销确认或本机清理尚未完成，请先完成清理"));
  const ownerId = profile && profile.ownerId;
  if (!ownerId || ownerId !== getOwnerId())
    return Promise.reject(new Error("公开资料账号不一致"));
  return serializePublication(ownerId, async () => {
    publicationStatus(ownerId, "pending");
    let remoteAcknowledged = false;
    try {
      const token = await ensureSession();
      if (ownerId !== getOwnerId())
        throw new Error("登录账号已变化，请切换回原账号后同步");
      const attempted = publishedPayload(requireLocalData(ownerId).profile);
      await backendRequest("/me/published-profile", "PATCH", attempted, token);
      remoteAcknowledged = true;
      confirmPublication(ownerId, attempted);
    } catch (caught) {
      const error = asRequestError(caught);
      if (remoteAcknowledged) error.ambiguous = true;
      // A rejected retry cannot establish the outcome of an earlier lost response.
      preservePendingStatus(ownerId);
      error.message += "；公开状态尚未确认，请联网后重新同步";
      throw error;
    }
  });
}
export function uploadAvatar<T = any>(filePath: string, expectedOwnerId?: string): Promise<T> {
  return localOwner().then(
    (ownerId) =>
      new Promise<T>((resolve, reject) => {
        if (expectedOwnerId && expectedOwnerId !== ownerId) return reject(new Error("账号已切换，请重新选择头像"));
        wx.getFileSystemManager().saveFile({
          tempFilePath: filePath,
          success(saved) {
            let previous = "";
            try {
              if (getOwnerId() !== ownerId) throw new Error("账号已切换，头像未保存");
              const data = requireLocalData(ownerId);
              previous = data.profile.avatarUrl || "";
              data.profile = {
                ...data.profile,
                avatarUrl: saved.savedFilePath,
              };
              local.write(ownerId, data);
            } catch (error) {
              // The new file is not referenced anywhere, so it must not occupy the saved-file quota.
              removeLocalFile(saved.savedFilePath);
              return reject(error);
            }
            // Saved files share a 10MB quota; the replaced avatar is no longer referenced.
            if (previous && previous !== saved.savedFilePath) removeLocalFile(previous);
            resolve(requireLocalData(ownerId).profile as T);
          },
          fail: () => reject(new Error("头像无法保存到手机，请检查存储空间")),
        });
      }),
  );
}
// Removes an avatar file this app saved earlier: wx.saveFile results, or files written under
// USER_DATA_PATH (backup restore). Remote URLs are never touched; failures are ignored.
function removeLocalFile(path: string): void {
  if (!path || /^https?:\/\//i.test(path)) return;
  try {
    const fs = wx.getFileSystemManager();
    const userData = (wx.env && wx.env.USER_DATA_PATH) || "";
    if (userData && path.startsWith(`${userData}/`)) fs.unlink({ filePath: path, fail: () => {} });
    else fs.removeSavedFile({ filePath: path, fail: () => {} });
  } catch (_) {
    /* Cleanup is best effort and must not affect the saved avatar. */
  }
}
export function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : "操作失败，请重试";
  const reference = error instanceof Error ? (error as RequestError).requestId : "";
  if (message.length > 18 || reference) {
    wx.showModal({
      title: "操作未完成",
      content: message + (reference ? `\n\n反馈编号：${reference}` : ""),
      showCancel: false,
      confirmText: "知道了",
    });
    return;
  }
  wx.showToast({
    title: message,
    icon: "none",
  });
}
