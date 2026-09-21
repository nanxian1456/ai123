const { validateSession, clearSession, hasProfileData, showError } = require("../../utils/api");

Page({
  data: { checking: false },
  enterHome() {
    if (this.data.checking) return;
    this.setData({ checking: true });
    return validateSession()
      .then((profile) => {
        if (hasProfileData(profile)) {
          wx.reLaunch({ url: "/pages/index/index" });
          return;
        }
        clearSession();
        wx.reLaunch({ url: "/pages/auth/index" });
      })
      .catch((error) => {
        if (error.message !== "NO_SESSION" && error.message !== "SESSION_INVALID") {
          showError(error);
          return;
        }
        clearSession();
        wx.reLaunch({ url: "/pages/auth/index" });
      })
      .finally(() => this.setData({ checking: false }));
  }
});
