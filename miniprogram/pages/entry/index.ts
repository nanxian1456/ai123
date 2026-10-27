import { validateSession, clearSession, hasProfileData, showError, getPendingAccountDeletion } from "../../utils/api";
import { hasConsent } from "../../utils/consent";

Page({
  data: { checking: false },
  enterHome() {
    if (this.data.checking) return;
    if (getPendingAccountDeletion()) {
      wx.reLaunch({ url: "/pages/settings-security/index" });
      return;
    }
    // Existing users who have not agreed to the current terms confirm them on the login page.
    // After agreement, the login page reuses local identity without requiring a network login.
    if (!hasConsent()) {
      wx.reLaunch({ url: "/pages/auth/index" });
      return;
    }
    this.setData({ checking: true });
    return validateSession<any>()
      .then((profile: any) => {
        if (hasProfileData(profile)) {
          wx.reLaunch({ url: "/pages/index/index" });
          return;
        }
        clearSession();
        wx.reLaunch({ url: "/pages/auth/index" });
      })
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
