import { validateSession, clearSession } from "../../utils/api";

Page({
  data: { checking: true },
  onLoad() { this.checkSession(); },
  checkSession() {
    validateSession<any>().then(profile => {
      wx.reLaunch({ url: profile.profileCompleted ? "/pages/index/index" : "/pages/profile-setup/index" });
    }).catch(() => {
      clearSession();
      this.setData({ checking: false });
    });
  },
  enterHome() {
    if (this.data.checking) return;
  enterHome() {
    wx.reLaunch({
      url: "/pages/auth/index",
      fail(error) {
        console.error("进入登录页失败", error);
        wx.showToast({ title: "页面打开失败，请重新编译", icon: "none" });
      }
    });
  }
});
