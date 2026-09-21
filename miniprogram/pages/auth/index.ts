import { ensureSession, request, hasProfileData, showError } from "../../utils/api";

Page({
  data: { loggingIn: false },
  login() {
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true });
    return ensureSession(true)
      .then(() => request<any>("/me"))
      .then(profile => {
        if (hasProfileData(profile)) wx.switchTab({ url: "/pages/index/index" });
        else wx.redirectTo({ url: "/pages/profile-setup/index" });
      })
      .catch(showError)
      .finally(() => this.setData({ loggingIn: false }));
  }
});
