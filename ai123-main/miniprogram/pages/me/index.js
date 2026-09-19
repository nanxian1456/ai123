const { request, showError } = require("../../utils/api");
Page({ data: { profile: null }, onShow() { this.load(); }, load() { request("/me").then((profile) => { if (!profile.profileCompleted) wx.navigateTo({ url: "/pages/profile-setup/index" }); else this.setData({ profile }); }).catch(showError); }, edit() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); } });
