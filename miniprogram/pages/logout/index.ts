import { clearSession, revokeAllSessions, showError } from "../../utils/api";

Page({
  data: { loggingOut: false, error: "" },
  cancel() { if (!this.data.loggingOut) wx.navigateBack(); },
  confirmLogout() {
    if (this.data.loggingOut) return;
    this.setData({ loggingOut: true }); clearSession(); wx.reLaunch({ url: "/pages/auth/index" });
  },
  logoutAll() {
    if (this.data.loggingOut) return;
    wx.showModal({ title: "退出所有设备", content: "将撤销该账号所有服务器登录令牌。其他设备下次联网需要重新登录，但其本机离线资料不会被删除或锁定。需要联网和重新验证微信身份。", confirmText: "确认退出",
      success: async result => {
        if (!result.confirm || this.data.loggingOut) return;
        this.setData({ loggingOut: true, error: "" });
        try { await revokeAllSessions(); wx.reLaunch({ url: "/pages/auth/index" }); }
        catch (error) { this.setData({ error: error instanceof Error ? error.message : "退出结果未确认", loggingOut: false }); showError(error); }
      } });
  },
});
