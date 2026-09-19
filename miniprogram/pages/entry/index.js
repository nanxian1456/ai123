Page({
  enterHome() {
    wx.reLaunch({
      url: "/pages/auth/index",
      fail(error) {
        console.error("进入登录页失败", error);
        wx.showToast({ title: "页面打开失败，请重新编译", icon: "none" });
      }
    });
  }
});
