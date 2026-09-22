import { request, showError } from "../../utils/api";

const VISIBILITY_FIELDS = [{ field: "avatar", label: "头像" }, { field: "nickname", label: "昵称" }, { field: "organization", label: "单位" }, { field: "position", label: "职务" }, { field: "city", label: "城市" }, { field: "bio", label: "个人简介" }];
const PRIVATE_VISIBILITY = { avatar: false, nickname: false, organization: false, position: false, city: false, bio: false };
const normalizeProfile = (profile: any) => ({ ...profile, visibility: { ...PRIVATE_VISIBILITY, ...(profile.visibility || {}) } });
const visibilityItems = (visibility: any) => VISIBILITY_FIELDS.map(item => ({ ...item, enabled: visibility[item.field] }));

Page({
  data: { profile: null as any, visibilityItems: [] as any[], savingVisibility: false },
  onShow() { this.load(); },
  async load() { try { const profile = normalizeProfile(await request<any>("/me")); this.setData({ profile, visibilityItems: visibilityItems(profile.visibility) }); } catch (error) { showError(error); } },
  changeVisibility(event: any) {
    if (this.data.savingVisibility || !this.data.profile) return;
    const visibility = { ...this.data.profile.visibility, [event.currentTarget.dataset.field]: event.detail.value };
    this.setData({ "profile.visibility": visibility, visibilityItems: visibilityItems(visibility), savingVisibility: true });
    request<any>("/me/visibility", "PATCH", visibility).then(profile => { const normalized = normalizeProfile(profile); this.setData({ profile: normalized, visibilityItems: visibilityItems(normalized.visibility) }); }).catch(error => { this.load(); showError(error); }).finally(() => this.setData({ savingVisibility: false }));
  }
});
