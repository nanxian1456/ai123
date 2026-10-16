const API_BASE_URLS = {
  develop: "http://127.0.0.1:8080/api",
  trial: "",
  release: ""
};
const DEVICE_DEVELOP_API_BASE_URL = "http://192.168.1.2:8080/api";

function getApiBaseUrl() {
  const account = typeof wx.getAccountInfoSync === "function" ? wx.getAccountInfoSync() : null;
  const environment = account && account.miniProgram && account.miniProgram.envVersion || "develop";
  const platform = typeof wx.getSystemInfoSync === "function" ? wx.getSystemInfoSync().platform : "devtools";
  const configuredUrl = environment === "develop" && platform !== "devtools"
    ? DEVICE_DEVELOP_API_BASE_URL : API_BASE_URLS[environment];
  const url = (configuredUrl || "").trim().replace(/\/+$/, "");
  if (!url) throw new Error(`请配置${environment}环境的后端 API 地址`);
  if (!/^https?:\/\/[^/?#]+\/api$/i.test(url)) throw new Error("后端 API 地址格式无效，应以 /api 结尾");
  if (environment !== "develop" && !url.startsWith("https://")) throw new Error("体验版和正式版必须使用 HTTPS 后端地址");
  return url;
}

module.exports = { getApiBaseUrl };
