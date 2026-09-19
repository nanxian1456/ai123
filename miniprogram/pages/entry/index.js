const { validateSession, ensureSession, request, clearSession, showError } = require("../../utils/api");

Page({
  data: { checking: false, loggingIn: false },
  enterHome() {
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true, checking: true });
    const openNext = (profile) => wx.reLaunch({ url: profile.profileCompleted ? "/pages/index/index" : "/pages/profile-setup/index" });
    validateSession()
      .then(openNext)
      .catch(() => {
        clearSession();
        return ensureSession(true).then(() => request("/me")).then(openNext);
      })
      .catch(showError)
      .finally(() => this.setData({ loggingIn: false, checking: false }));
  }
});
