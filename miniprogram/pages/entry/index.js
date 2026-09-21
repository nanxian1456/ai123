const { validateSession, clearSession, showError } = require("../../utils/api");

Page({
  data: { checking: false },
  enterHome() {
    if (this.data.checking) return;
    this.setData({ checking: true });
    const openNext = (profile) => wx.reLaunch({ url: profile.profileCompleted ? "/pages/index/index" : "/pages/profile-setup/index" });
    return validateSession()
      .then(openNext)
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
