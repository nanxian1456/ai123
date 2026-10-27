"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiBaseUrl = getApiBaseUrl;
exports.getMediaUrl = getMediaUrl;
let localConfig = {};
try {
    localConfig = require("./api-config.local") || {};
}
catch {
    /* Optional per-build configuration. */
}
const API_BASE_URLS = {
    develop: localConfig.develop || "http://127.0.0.1:8081/api",
    trial: localConfig.trial,
    release: localConfig.release,
};
function getApiBaseUrl() {
    const account = typeof wx.getAccountInfoSync === "function"
        ? wx.getAccountInfoSync()
        : null;
    const environment = account?.miniProgram?.envVersion || "develop";
    const platform = typeof wx.getSystemInfoSync === "function"
        ? wx.getSystemInfoSync().platform
        : "devtools";
    const device = environment === "develop" && platform !== "devtools";
    const url = (device ? localConfig.deviceDevelop || "" : API_BASE_URLS[environment] || "")
        .trim()
        .replace(/\/+$/, "");
    if (!url)
        throw new Error(device
            ? "请在 api-config.local.js 配置真机后端 API 地址"
            : `请配置${environment}环境的后端 API 地址`);
    if (!/^https?:\/\/[^/?#]+\/api$/i.test(url))
        throw new Error("后端 API 地址格式无效，应以 /api 结尾");
    if (environment !== "develop" && !url.startsWith("https://"))
        throw new Error("体验版和正式版必须使用 HTTPS 后端地址");
    return url;
}
/**
 * Static media (page background videos) served by the same backend as the API, so the
 * simulator, a LAN device and release builds all resolve to a reachable host.
 * Returns "" when no backend is configured; pages then keep their plain background.
 */
function getMediaUrl(path) {
    try {
        return getApiBaseUrl().replace(/\/api$/i, "") + path;
    }
    catch {
        return "";
    }
}
