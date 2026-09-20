const { request, uploadAvatar, showError } = require("../../utils/api");

Page({
  data: { profile: null, uploading: false },
  onShow() { this.load(); },
  load() { request("/me").then((profile) => { if (!profile.profileCompleted) wx.navigateTo({ url: "/pages/profile-setup/index" }); else this.setData({ profile }); }).catch(showError); },
  edit() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); },
  copyContactCode() { if (this.data.profile && this.data.profile.contactCode) wx.setClipboardData({ data: this.data.profile.contactCode }); },
  changeAvatar() {
    if (this.data.uploading) return;
    wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], success: ({ tempFiles }) => {
      const file = tempFiles[0];
      if (!file || file.size > 5 * 1024 * 1024) { wx.showToast({ title: "请选择不超过 5MB 的图片", icon: "none" }); return; }
      this.setData({ uploading: true });
      uploadAvatar(file.tempFilePath).then((profile) => { this.setData({ profile }); wx.showToast({ title: "头像已更新", icon: "success" }); }).catch(showError).finally(() => this.setData({ uploading: false }));
    } });
  }
});
