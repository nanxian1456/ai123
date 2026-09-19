import { request, uploadAvatar, showError } from "../../utils/api";

const VISIBILITY_FIELDS = [{ field: "avatar", label: "头像" }, { field: "nickname", label: "昵称" }, { field: "organization", label: "单位" }, { field: "position", label: "职务" }, { field: "city", label: "城市" }, { field: "bio", label: "个人简介" }];
const PRIVATE_VISIBILITY = { avatar: false, nickname: false, organization: false, position: false, city: false, bio: false };
const normalizeProfile = (profile: any) => ({ ...profile, visibility: { ...PRIVATE_VISIBILITY, ...(profile.visibility || {}) } });
const visibilityItems = (visibility: any) => VISIBILITY_FIELDS.map(item => ({ ...item, enabled: visibility[item.field] }));

Page({
  data: { profile: null as any, visibilityItems: [] as any[], uploading: false, savingVisibility: false },
  onShow() { this.load(); },
  setProfile(profile: any) { const normalized = normalizeProfile(profile); this.setData({ profile: normalized, visibilityItems: visibilityItems(normalized.visibility) }); },
  async load() { try { const profile = await request<any>("/me"); if (!profile.profileCompleted) wx.navigateTo({ url: "/pages/profile-setup/index" }); else this.setProfile(profile); } catch (error) { showError(error); } },
  edit() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); },
  copyContactCode() { if (this.data.profile?.contactCode) wx.setClipboardData({ data: this.data.profile.contactCode }); },
  changeVisibility(event: any) { if (this.data.savingVisibility || !this.data.profile) return; const visibility = { ...this.data.profile.visibility, [event.currentTarget.dataset.field]: event.detail.value }; this.setData({ "profile.visibility": visibility, visibilityItems: visibilityItems(visibility), savingVisibility: true }); request<any>("/me/visibility", "PATCH", visibility).then(profile => this.setProfile(profile)).catch(error => { this.load(); showError(error); }).finally(() => this.setData({ savingVisibility: false })); },
  changeAvatar() { if (this.data.uploading) return; wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], success: ({ tempFiles }) => { const file = tempFiles[0]; if (!file || file.size > 5 * 1024 * 1024) return wx.showToast({ title: "请选择不超过 5MB 的图片", icon: "none" }); this.setData({ uploading: true }); uploadAvatar<any>(file.tempFilePath).then(profile => { this.setProfile(profile); wx.showToast({ title: "头像已更新", icon: "success" }); }).catch(showError).finally(() => this.setData({ uploading: false })); } }); }
});
