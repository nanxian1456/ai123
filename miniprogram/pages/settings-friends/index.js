const { request, showError } = require("../../utils/api");

Page({
  data: { profile: null },
  onShow() { request("/me").then((profile) => this.setData({ profile })).catch(showError); },
  copyContactCode() {
    if (this.data.profile && this.data.profile.contactCode) wx.setClipboardData({ data: this.data.profile.contactCode });
  }
});
