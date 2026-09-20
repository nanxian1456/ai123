import { request, uploadAvatar, showError } from "../../utils/api";

Page({
  data: { profile: null as any, uploading: false },
  onShow() { this.load(); },
  async load() { try { const profile = await request<any>("/me"); if (!profile.profileCompleted) wx.navigateTo({ url: "/pages/profile-setup/index" }); else this.setData({ profile }); } catch (error) { showError(error); } },
  edit() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); },
  copyContactCode() { if (this.data.profile?.contactCode) wx.setClipboardData({ data: this.data.profile.contactCode }); },
  changeAvatar() { if (this.data.uploading) return; wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], success: ({ tempFiles }) => { const file = tempFiles[0]; if (!file || file.size > 5 * 1024 * 1024) return wx.showToast({ title: "请选择不超过 5MB 的图片", icon: "none" }); this.setData({ uploading: true }); uploadAvatar<any>(file.tempFilePath).then(profile => { this.setData({ profile }); wx.showToast({ title: "头像已更新", icon: "success" }); }).catch(showError).finally(() => this.setData({ uploading: false })); } }); }
});
