import { ensureSession, validateSession, request, hasProfileData, showError } from "../../utils/api";
import { getMediaUrl } from "../../utils/api-config";
import { hasConsent, recordConsent } from "../../utils/consent";

Page({
  data: { loggingIn: false, bgVideo: "", agreed: false },
  onLoad() {
    // Served by the backend; if it is missing or unreachable the gradient background remains.
    this.setData({ bgVideo: getMediaUrl("/videos/background.mp4"), agreed: hasConsent() });
  },
  onVideoError() {
    this.setData({ bgVideo: "" });
  },
  toggleAgree() {
    if (!this.data.loggingIn) this.setData({ agreed: !this.data.agreed });
  },
  openTerms() {
    wx.navigateTo({ url: "/pages/legal/index?doc=terms" });
  },
  openPrivacy() {
    wx.navigateTo({ url: "/pages/legal/index?doc=privacy" });
  },
  login() {
    if (this.data.loggingIn) return;
    if (!this.data.agreed)
      return wx.showToast({ title: "请先阅读并同意用户协议和隐私政策", icon: "none" });
    try {
      recordConsent();
    } catch (error) {
      return showError(error);
    }
    this.setData({ loggingIn: true });
    return validateSession<any>()
      .catch((error: Error & { code?: string }) => {
        const code = error.code || error.message;
        if (code !== "NO_SESSION" && code !== "SESSION_INVALID") throw error;
        return ensureSession(true).then(() => request<any>("/me"));
      })
      .then(profile => {
        if (hasProfileData(profile)) wx.switchTab({ url: "/pages/index/index" });
        else wx.redirectTo({ url: "/pages/profile-setup/index" });
      })
      .catch(showError)
      .finally(() => this.setData({ loggingIn: false }));
  }
});
