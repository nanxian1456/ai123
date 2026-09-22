Page({
  openProfile() { wx.navigateTo({ url: "/pages/settings-profile/index" }); },
  openSecurity() { wx.navigateTo({ url: "/pages/settings-security/index" }); },
  openFriends() { wx.navigateTo({ url: "/pages/settings-friends/index" }); },
  openPrivacy() { wx.navigateTo({ url: "/pages/settings-privacy/index" }); }
});
