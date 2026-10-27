interface LocalApiConfig {
  develop?: string;
  deviceDevelop?: string;
  trial?: string;
  release?: string;
}
declare function require(name: string): LocalApiConfig;
let localConfig: LocalApiConfig = {};
try {
  localConfig = require("./api-config.local") || {};
} catch {
  /* Optional per-build configuration. */
}

const API_BASE_URLS: Record<string, string | undefined> = {
  develop: localConfig.develop || "http://127.0.0.1:8080/api",
  trial: localConfig.trial,
  release: localConfig.release,
};

// wx.getSystemInfoSync is deprecated; getDeviceInfo (base library 2.20.1+) is preferred,
// with the old API kept only as a fallback for older WeChat versions.
function currentPlatform(): string {
  if (typeof wx.getDeviceInfo === "function") return wx.getDeviceInfo().platform;
  if (typeof wx.getSystemInfoSync === "function") return wx.getSystemInfoSync().platform;
  return "devtools";
}

export function getApiBaseUrl(): string {
  const account =
    typeof wx.getAccountInfoSync === "function"
      ? wx.getAccountInfoSync()
      : null;
  const environment = account?.miniProgram?.envVersion || "develop";
  const platform = currentPlatform();
  const device = environment === "develop" && platform !== "devtools";
  const url = (
    device ? localConfig.deviceDevelop || "" : API_BASE_URLS[environment] || ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (!url)
    throw new Error(
      device
        ? "请在 api-config.local.js 配置真机后端 API 地址"
        : `请配置${environment}环境的后端 API 地址`,
    );
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
export function getMediaUrl(path: string): string {
  try {
    return getApiBaseUrl().replace(/\/api$/i, "") + path;
  } catch {
    return "";
  }
}
