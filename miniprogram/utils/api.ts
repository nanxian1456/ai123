const BASE_URL = "http://127.0.0.1:8080/api";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export function request<T>(path: string, method: Method = "GET", data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      header: { "content-type": "application/json", "X-User-Id": "demo" },
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data as T);
        else reject(new Error((response.data as { detail?: string }).detail || "请求失败"));
      },
      fail: () => reject(new Error("无法连接后端，请确认 Java 服务已启动"))
    });
  });
}

export function showError(error: unknown) {
  const message = error instanceof Error ? error.message : "操作失败";
  wx.showToast({ title: message, icon: "none" });
}
