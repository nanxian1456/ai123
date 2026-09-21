import { validateSession, clearSession, showError } from "../../utils/api";

Page({
  data: { checking: false },
  enterHome() {
    if (this.data.checking) return;
    this.setData({ checking: true });
    const openNext = (profile: any) => wx.reLaunch({ url: profile.profileCompleted ? "/pages/index/index" : "/pages/profile-setup/index" });
    return validateSession<any>()
      .then(openNext)
      .catch((error: Error) => {
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
