const { request, showError } = require("../../utils/api");

Page({
  data: { profile: null, profileInitial: "我" },
  onShow() { this.load(); },
  load() {
    request("/me").then((profile) => {
      this.setData({ profile, profileInitial: profile.nickname ? profile.nickname.slice(0, 1) : "我" });
    }).catch(showError);
  },
  editProfile() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); }
});
