import { request, showError } from "../../utils/api";

Page({
  data: { profile: null as any, profileInitial: "我" },
  onShow() { this.load(); },
  async load() {
    try {
      const profile = await request<any>("/me");
      this.setData({ profile, profileInitial: profile.nickname ? profile.nickname.slice(0, 1) : "我" });
    } catch (error) { showError(error); }
  },
  editProfile() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); }
});
