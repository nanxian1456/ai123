import { request, showError } from "../../utils/api";

Page({
  data: { profile: null as any },
  async onShow() { try { this.setData({ profile: await request<any>("/me") }); } catch (error) { showError(error); } },
  copyContactCode() { if (this.data.profile?.contactCode) wx.setClipboardData({ data: this.data.profile.contactCode }); }
});
