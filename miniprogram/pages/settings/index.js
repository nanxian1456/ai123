const { request, showError } = require("../../utils/api");

const VISIBILITY_FIELDS = [
  { field: "avatar", label: "头像" }, { field: "nickname", label: "昵称" },
  { field: "organization", label: "单位" }, { field: "position", label: "职务" },
  { field: "city", label: "城市" }, { field: "bio", label: "个人简介" }
];
const PRIVATE_VISIBILITY = { avatar: false, nickname: false, organization: false, position: false, city: false, bio: false };
const normalizeProfile = (profile) => ({ ...profile, visibility: { ...PRIVATE_VISIBILITY, ...(profile.visibility || {}) } });
const visibilityItems = (visibility) => VISIBILITY_FIELDS.map((item) => ({ ...item, enabled: visibility[item.field] }));

Page({
  data: { profile: null, profileInitial: "我", visibilityItems: [], savingVisibility: false },
  onShow() { this.load(); },
  editProfile() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); },
  openLogout() { wx.navigateTo({ url: "/pages/logout/index" }); },
  copyContactCode() {
    if (this.data.profile && this.data.profile.contactCode) {
      wx.setClipboardData({ data: this.data.profile.contactCode });
    }
  },
  load() {
    request("/me").then((profile) => {
      const normalized = normalizeProfile(profile);
      this.setData({ profile: normalized, profileInitial: normalized.nickname ? normalized.nickname.slice(0, 1) : "我", visibilityItems: visibilityItems(normalized.visibility) });
    }).catch(showError);
  },
  changeVisibility(event) {
    if (this.data.savingVisibility || !this.data.profile) return;
    const visibility = { ...this.data.profile.visibility, [event.currentTarget.dataset.field]: event.detail.value };
    this.setData({ "profile.visibility": visibility, visibilityItems: visibilityItems(visibility), savingVisibility: true });
    request("/me/visibility", "PATCH", visibility)
      .then((profile) => { const normalized = normalizeProfile(profile); this.setData({ profile: normalized, visibilityItems: visibilityItems(normalized.visibility) }); })
      .catch((error) => { this.load(); showError(error); })
      .finally(() => this.setData({ savingVisibility: false }));
  }
});
