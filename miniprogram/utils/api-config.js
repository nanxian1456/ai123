const API_BASE_URLS = {
  develop: "http://127.0.0.1:8080/api",
  trial: "",
  release: ""
};

function getApiBaseUrl() {
  const account = typeof wx.getAccountInfoSync === "function" ? wx.getAccountInfoSync() : null;
  const environment = account && account.miniProgram && account.miniProgram.envVersion || "develop";
  const url = (API_BASE_URLS[environment] || "").trim().replace(/\/+$/, "");
  if (!url) throw new Error(`请配置${environment}环境的后端 API 地址`);
  if (!/^https?:\/\/[^/?#]+\/api$/i.test(url)) throw new Error("后端 API 地址格式无效，应以 /api 结尾");
  if (environment !== "develop" && !url.startsWith("https://")) throw new Error("体验版和正式版必须使用 HTTPS 后端地址");
  return url;
}

module.exports = { getApiBaseUrl };
