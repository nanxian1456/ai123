import { clearSession } from "../../utils/api";

Page({
  data: { loggingOut: false },
  cancel() { wx.navigateBack(); },
  confirmLogout() { if (this.data.loggingOut) return; this.setData({ loggingOut: true }); clearSession(); wx.reLaunch({ url: "/pages/auth/index" }); }
});
