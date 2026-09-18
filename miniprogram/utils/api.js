const BASE_URL = "http://127.0.0.1:8080/api";

function request(path, method = "GET", data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${path}`, method, data,
      header: { "content-type": "application/json", "X-User-Id": "demo" },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
        else reject(new Error((response.data && response.data.detail) || "请求失败"));
      },
      fail() { reject(new Error("无法连接后端，请确认 Java 服务已启动")); }
    });
  });
}

function showError(error) { wx.showToast({ title: error && error.message ? error.message : "操作失败", icon: "none" }); }

module.exports = { request, showError };
