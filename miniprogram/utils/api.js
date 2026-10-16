"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoredToken = getStoredToken;
exports.getCurrentOwnerId = getCurrentOwnerId;
exports.clearSession = clearSession;
exports.ensureSession = ensureSession;
exports.hasProfileData = hasProfileData;
exports.validateSession = validateSession;
exports.request = request;
exports.syncPublishedProfile = syncPublishedProfile;
exports.uploadAvatar = uploadAvatar;
exports.showError = showError;
const local = require("./local-data");
const api_config_1 = require("./api-config");
const TOKEN_KEY = "ai-network-auth-token";
const OWNER_KEY = "ai-network-owner-id";
const EXPIRY_KEY = "ai-network-token-expires-at";
let loginPromise = null;
let migrationPromise = null;
const publicationQueues = new Map();
function asRequestError(error) {
    return error instanceof Error ? error : new Error("服务请求失败");
}
function sessionError() {
    const error = new Error("登录已过期，请联网后重新登录；本机资料仍可使用");
    error.code = "SESSION_INVALID";
    return error;
}
function cachedOwner() {
    const ownerId = getOwnerId();
    return ownerId && local.read(ownerId) ? ownerId : "";
}
function requireLocalData(ownerId) {
    const data = local.read(ownerId);
    if (!data)
        throw new Error("本机数据尚未初始化，请重新登录");
    return data;
}
async function localOwner() {
    const ownerId = cachedOwner();
    return ownerId || ensureSession().then(() => getOwnerId());
}
function serializePublication(ownerId, task) {
    const previous = publicationQueues.get(ownerId) || Promise.resolve();
    const operation = previous.catch(() => { }).then(task);
    publicationQueues.set(ownerId, operation);
    operation.then(() => {
        if (publicationQueues.get(ownerId) === operation)
            publicationQueues.delete(ownerId);
    }, () => {
        if (publicationQueues.get(ownerId) === operation)
            publicationQueues.delete(ownerId);
    });
    return operation;
}
function publicationStatus(ownerId, status) {
    const current = local.read(ownerId);
    if (current) {
        current.profile.publicationStatus = status;
        local.write(ownerId, current);
    }
}
function getStoredToken() {
    return wx.getStorageSync(TOKEN_KEY) || "";
}
function getOwnerId() {
    return wx.getStorageSync(OWNER_KEY) || "";
}
function getCurrentOwnerId() {
    return localOwner();
}
function clearSession() {
    wx.removeStorageSync(TOKEN_KEY);
    wx.removeStorageSync(OWNER_KEY);
    wx.removeStorageSync(EXPIRY_KEY);
}
function wechatLogin() {
    return new Promise((resolve, reject) => wx.login({
        success: ({ code }) => code ? resolve(code) : reject(new Error("未获取到微信登录凭证")),
        fail: () => reject(new Error("微信登录失败")),
    }));
}
function backendRequest(path, method, data, token) {
    return new Promise((resolve, reject) => wx.request({
        url: `${(0, api_config_1.getApiBaseUrl)()}${path}`,
        method: method,
        data,
        header: {
            "content-type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        success(response) {
            if (response.statusCode >= 200 && response.statusCode < 300)
                resolve(response.data);
            else {
                if (response.statusCode === 401 && token === getStoredToken()) {
                    wx.removeStorageSync(TOKEN_KEY);
                    wx.removeStorageSync(EXPIRY_KEY);
                }
                const body = response.data && typeof response.data === "object"
                    ? response.data
                    : {};
                const fields = body.fieldErrors && typeof body.fieldErrors === "object"
                    ? Object.values(body.fieldErrors).filter((value) => typeof value === "string")
                    : [];
                const error = response.statusCode === 401
                    ? sessionError()
                    : new Error([
                        typeof body.message === "string"
                            ? body.message
                            : "服务请求失败",
                        ...fields,
                    ].join("；"));
                error.statusCode = response.statusCode;
                error.ambiguous = response.statusCode >= 500;
                reject(error);
            }
        },
        fail: () => {
            const error = new Error("无法连接后端，请检查网络后重试");
            error.ambiguous = true;
            reject(error);
        },
    }));
}
function saveRemoteAvatar(profile, token) {
    const url = profile && profile.avatarUrl;
    if (!url || !/^https?:\/\//.test(url))
        return Promise.resolve(profile);
    return new Promise((resolve, reject) => wx.downloadFile({
        url,
        header: { Authorization: `Bearer ${token}` },
        success(result) {
            if (result.statusCode !== 200)
                return reject(new Error("旧头像下载失败，请稍后重试迁移"));
            wx.getFileSystemManager().saveFile({
                tempFilePath: result.tempFilePath,
                success: (saved) => resolve({ ...profile, avatarUrl: saved.savedFilePath }),
                fail: () => reject(new Error("旧头像无法保存到手机，请检查存储空间")),
            });
        },
        fail: () => reject(new Error("旧头像下载失败，请稍后重试迁移")),
    }));
}
function prepareLocal(token, expectedOwner) {
    if (expectedOwner && local.read(expectedOwner))
        return Promise.resolve(expectedOwner);
    if (!migrationPromise)
        migrationPromise = backendRequest("/local-export", "GET", undefined, token)
            .then((exportData) => {
            if (!exportData ||
                !exportData.ownerId ||
                (expectedOwner && expectedOwner !== exportData.ownerId))
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
async function ensureSession(force = false) {
    const token = getStoredToken();
    if (!force &&
        token &&
        (!wx.getStorageSync(EXPIRY_KEY) ||
            Date.now() < wx.getStorageSync(EXPIRY_KEY)))
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
                wx.setStorageSync(EXPIRY_KEY, Date.now() + Number(session.expiresIn || 0) * 1000);
                return session.token;
            });
        })
            .finally(() => {
            loginPromise = null;
        });
    return loginPromise;
}
function hasProfileData(profile) {
    if (!profile)
        return false;
    if (profile.profileCompleted)
        return true;
    return [
        profile.nickname,
        profile.organization,
        profile.position,
        profile.city,
        profile.bio,
        profile.avatarUrl,
    ].some((value) => typeof value === "string" && value.trim().length > 0);
}
async function validateSession() {
    const ownerId = cachedOwner();
    if (ownerId)
        return Promise.resolve(local.handle(ownerId, "/me"));
    const token = getStoredToken();
    if (!token)
        return Promise.reject(new Error("NO_SESSION"));
    if (wx.getStorageSync(EXPIRY_KEY) &&
        Date.now() >= wx.getStorageSync(EXPIRY_KEY))
        return Promise.reject(sessionError());
    return prepareLocal(token, getOwnerId()).then((ownerId) => local.handle(ownerId, "/me"));
}
function request(path, method = "GET", data) {
    if (path === "/ai/extract")
        return ensureSession().then((token) => backendRequest(path, method, data, token));
    if (path === "/me/import-code")
        return ensureSession().then((token) => backendRequest("/me", "GET", undefined, token).then((profile) => profile.contactCode));
    if (path.startsWith("/users/importable/"))
        return ensureSession().then((token) => backendRequest(path, method, data, token));
    return localOwner().then((ownerId) => {
        if (method !== "PATCH" || (path !== "/me" && path !== "/me/visibility"))
            return local.handle(ownerId, path, method, data);
        return serializePublication(ownerId, async () => {
            const previous = requireLocalData(ownerId).profile;
            let result;
            try {
                result = local.handle(ownerId, path, method, data);
            }
            catch (error) {
                return Promise.reject(error);
            }
            if (!previous.visibility.nickname &&
                !result.visibility.nickname &&
                previous.publicationStatus !== "pending")
                return result;
            let remoteAcknowledged = false;
            try {
                publicationStatus(ownerId, "pending");
                const token = await ensureSession();
                if (getOwnerId() !== ownerId)
                    throw new Error("登录账号已变化，请切换回原账号后同步");
                await backendRequest("/me/published-profile", "PATCH", publishedPayload(result), token);
                remoteAcknowledged = true;
                confirmPublication(ownerId, publishedPayload(result));
                return requireLocalData(ownerId).profile;
            }
            catch (caught) {
                const error = asRequestError(caught);
                if (remoteAcknowledged)
                    error.ambiguous = true;
                if (!error.ambiguous) {
                    const current = requireLocalData(ownerId);
                    for (const field of Object.keys(result)) {
                        if (field !== "publicationStatus" &&
                            JSON.stringify(previous[field]) !==
                                JSON.stringify(result[field]) &&
                            JSON.stringify(current.profile[field]) ===
                                JSON.stringify(result[field]))
                            current.profile[field] = previous[field];
                    }
                    current.profile.publicationStatus =
                        previous.publicationStatus === "pending" ? "pending" : "error";
                    local.write(ownerId, current);
                }
                else {
                    preservePendingStatus(ownerId);
                    error.message +=
                        "；公开状态尚未确认，请联网后重新同步，当前设置不代表服务端已生效";
                }
                throw error;
            }
        });
    });
}
function confirmPublication(ownerId, attempted) {
    if (JSON.stringify(publishedPayload(requireLocalData(ownerId).profile)) !==
        JSON.stringify(attempted)) {
        const error = new Error("本机公开资料已变化，请重新同步");
        error.ambiguous = true;
        throw error;
    }
    try {
        publicationStatus(ownerId, "synced");
    }
    catch (caught) {
        const error = caught instanceof Error ? caught : new Error("同步状态无法保存");
        // The server has acknowledged the mutation. A storage failure cannot undo it.
        error.ambiguous = true;
        throw error;
    }
}
function preservePendingStatus(ownerId) {
    try {
        publicationStatus(ownerId, "pending");
    }
    catch (_) { /* Keep the original ambiguous result when local storage is unavailable. */ }
}
function publishedPayload(profile) {
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
function syncPublishedProfile(profile) {
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
        }
        catch (caught) {
            const error = asRequestError(caught);
            if (remoteAcknowledged)
                error.ambiguous = true;
            // A rejected retry cannot establish the outcome of an earlier lost response.
            preservePendingStatus(ownerId);
            error.message += "；公开状态尚未确认，请联网后重新同步";
            throw error;
        }
    });
}
function uploadAvatar(filePath) {
    return localOwner().then((ownerId) => new Promise((resolve, reject) => wx.getFileSystemManager().saveFile({
        tempFilePath: filePath,
        success(saved) {
            try {
                const data = requireLocalData(ownerId);
                data.profile = {
                    ...data.profile,
                    avatarUrl: saved.savedFilePath,
                };
                local.write(ownerId, data);
                resolve(data.profile);
            }
            catch (error) {
                reject(error);
            }
        },
        fail: () => reject(new Error("头像无法保存到手机，请检查存储空间")),
    })));
}
function showError(error) {
    wx.showToast({
        title: error instanceof Error ? error.message : "操作失败",
        icon: "none",
    });
}
