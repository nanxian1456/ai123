const { request, uploadAvatar, showError } = require("../../utils/api");
const VISIBILITY_FIELDS = [
  { field: "avatar", label: "头像" }, { field: "nickname", label: "昵称" },
  { field: "organization", label: "单位" }, { field: "position", label: "职务" },
  { field: "city", label: "城市" }, { field: "bio", label: "个人简介" }
];
const PRIVATE_VISIBILITY = { avatar: false, nickname: false, organization: false, position: false, city: false, bio: false };
function normalizeProfile(profile) { return { ...profile, visibility: { ...PRIVATE_VISIBILITY, ...(profile.visibility || {}) } }; }
function visibilityItems(visibility) { return VISIBILITY_FIELDS.map((item) => ({ ...item, enabled: visibility[item.field] })); }

Page({
  data: { profile: null, visibilityItems: [], uploading: false, savingVisibility: false },
  onShow() { this.load(); },
  setProfile(profile) { const normalized = normalizeProfile(profile); this.setData({ profile: normalized, visibilityItems: visibilityItems(normalized.visibility) }); },
  load() { request("/me").then((profile) => { if (!profile.profileCompleted) wx.navigateTo({ url: "/pages/profile-setup/index" }); else this.setProfile(profile); }).catch(showError); },
  edit() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); },
  changeVisibility(event) {
    if (this.data.savingVisibility || !this.data.profile) return;
    const visibility = { ...this.data.profile.visibility, [event.currentTarget.dataset.field]: event.detail.value };
    this.setData({ "profile.visibility": visibility, visibilityItems: visibilityItems(visibility), savingVisibility: true });
    request("/me/visibility", "PATCH", visibility).then((profile) => this.setProfile(profile)).catch((error) => { this.load(); showError(error); }).finally(() => this.setData({ savingVisibility: false }));
  },
  changeAvatar() { if (this.data.uploading) return; wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], success: ({ tempFiles }) => { const file = tempFiles[0]; if (!file || file.size > 5 * 1024 * 1024) { wx.showToast({ title: "请选择不超过 5MB 的图片", icon: "none" }); return; } this.setData({ uploading: true }); uploadAvatar(file.tempFilePath).then((profile) => { this.setProfile(profile); wx.showToast({ title: "头像已更新", icon: "success" }); }).catch(showError).finally(() => this.setData({ uploading: false })); } }); }
});
