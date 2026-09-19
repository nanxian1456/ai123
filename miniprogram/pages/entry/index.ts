import { validateSession, ensureSession, request, clearSession, showError } from "../../utils/api";

Page({
  data: { checking: false, loggingIn: false },
  enterHome() {
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true, checking: true });
    const openNext = (profile: any) => wx.reLaunch({ url: profile.profileCompleted ? "/pages/index/index" : "/pages/profile-setup/index" });
    validateSession<any>()
      .then(openNext)
      .catch(() => { clearSession(); return ensureSession(true).then(() => request<any>("/me")).then(openNext); })
      .catch(showError)
      .finally(() => this.setData({ loggingIn: false, checking: false }));
  }
});
