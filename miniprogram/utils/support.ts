import { getApiBaseUrl } from "./api-config";

// Deliberate allowlist: never copy storage, account identities, network addresses or raw errors.
export function diagnostics() {
  let account: any = {},
    base: any = {},
    device: any = {};
  try {
    account = wx.getAccountInfoSync()?.miniProgram || {};
  } catch (_) {}
  try {
    base = wx.getAppBaseInfo();
  } catch (_) {}
  try {
    device = wx.getDeviceInfo();
  } catch (_) {}
  const clean = (value: unknown) =>
    typeof value === "string"
      ? value.replace(/[^a-zA-Z0-9._ -]/g, "").slice(0, 60) || "未知"
      : "未知";
  const environment =
    (
      { develop: "开发版", trial: "体验版", release: "正式版" } as Record<
        string,
        string
      >
    )[account.envVersion] || "未知";
  let backend = "未配置或配置无效";
  try {
    backend = getApiBaseUrl().startsWith("https://")
      ? "已配置 HTTPS"
      : "已配置开发 HTTP";
  } catch (_) {}
  const version = clean(account.version),
    platform = clean(device.platform),
    sdk = clean(base.SDKVersion),
    wechat = clean(base.version);
  const text = `AI 人脉地图诊断信息\n环境：${environment}\n版本：${version}\n系统：${platform}\n微信：${wechat}\n基础库：${sdk}\n后端：${backend}`;
  return { environment, version, platform, sdk, wechat, backend, text };
}
