const { request, syncPublishedProfile, showError } = require("../../utils/api");

Page({
  data: { contactCode: "", profile: null, publishing: false },
  onShow() {
    Promise.all([request("/me/import-code"), request("/me")])
      .then(([contactCode, profile]) => this.setData({ contactCode, profile })).catch(showError);
  },
  copyCode() {
    if (this.data.contactCode) wx.setClipboardData({ data: this.data.contactCode });
  },
  publish() {
    if (this.data.publishing || !this.data.profile) return;
    this.setData({ publishing: true });
    syncPublishedProfile(this.data.profile)
      .then(() => wx.showToast({ title: "公开资料已更新", icon: "success" }))
      .catch(showError).finally(() => this.setData({ publishing: false }));
  }
});
