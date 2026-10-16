import { request, syncPublishedProfile, clearSession, showError } from "../../utils/api";
import { hasAiConsent, withdrawAiConsent, withdrawConsent } from "../../utils/consent";

const VISIBILITY_FIELDS = [
  { field: "nickname", label: "昵称" },
  { field: "organization", label: "单位" },
  { field: "position", label: "职务" },
  { field: "city", label: "城市" },
  { field: "bio", label: "个人简介" },
];
const PRIVATE_VISIBILITY = {
  avatar: false,
  nickname: false,
  organization: false,
  position: false,
  city: false,
  bio: false,
};
const normalizeProfile = (profile: any) => ({
  ...profile,
  visibility: { ...PRIVATE_VISIBILITY, ...(profile.visibility || {}) },
});
const visibilityItems = (visibility: any) =>
  VISIBILITY_FIELDS.map((item) => ({
    ...item,
    enabled: visibility[item.field],
  }));

Page({
  data: {
    profile: null as any,
    visibilityItems: [] as any[],
    savingVisibility: false,
    aiConsent: false,
  },
  onShow() {
    this.setData({ aiConsent: hasAiConsent() });
    this.load();
  },
  openTerms() {
    wx.navigateTo({ url: "/pages/legal/index?doc=terms" });
  },
  openPolicy() {
    wx.navigateTo({ url: "/pages/legal/index?doc=privacy" });
  },
  openWechatGuide() {
    if (typeof wx.openPrivacyContract === "function") wx.openPrivacyContract({});
    else wx.showToast({ title: "请更新微信后查看", icon: "none" });
  },
  withdrawAi() {
    if (!this.data.aiConsent) return;
    wx.showModal({
      title: "撤回 AI 智能整理授权",
      content: "撤回后不会再向 DeepSeek 发送文字，下次使用智能整理时会重新询问。已识别并保存的联系人不受影响。",
      confirmText: "撤回",
      success: (result) => {
        if (!result.confirm) return;
        withdrawAiConsent();
        this.setData({ aiConsent: false });
        wx.showToast({ title: "已撤回", icon: "success" });
      },
    });
  },
  withdrawAll() {
    wx.showModal({
      title: "撤回全部同意",
      content: "撤回后将退出登录，需重新同意《用户协议》和《隐私政策》才能继续使用。本机的联系人和资料不会被删除；如需删除服务器上的公开资料，请先关闭公开昵称。",
      confirmText: "撤回退出",
      confirmColor: "#d92d20",
      success: (result) => {
        if (!result.confirm) return;
        withdrawConsent();
        clearSession();
        wx.reLaunch({ url: "/pages/entry/index" });
      },
    });
  },
  async load() {
    try {
      const profile = normalizeProfile(await request<any>("/me"));
      this.setData({
        profile,
        visibilityItems: visibilityItems(profile.visibility),
      });
    } catch (error) {
      showError(error);
    }
  },
  async retryPublication() {
    if (this.data.savingVisibility || !this.data.profile) return;
    this.setData({ savingVisibility: true });
    try {
      await syncPublishedProfile(this.data.profile);
    } catch (error) {
      showError(error);
    } finally {
      await this.load();
      this.setData({ savingVisibility: false });
    }
  },
  changeVisibility(event: any) {
    if (this.data.savingVisibility || !this.data.profile) return;
    const visibility = {
      ...this.data.profile.visibility,
      [event.currentTarget.dataset.field]: event.detail.value,
    };
    this.setData({
      "profile.visibility": visibility,
      visibilityItems: visibilityItems(visibility),
      savingVisibility: true,
    });
    request<any>("/me/visibility", "PATCH", visibility)
      .then((profile) => {
        const normalized = normalizeProfile(profile);
        this.setData({
          profile: normalized,
          visibilityItems: visibilityItems(normalized.visibility),
        });
      })
      .catch((error) => {
        this.load();
        showError(error);
      })
      .finally(() => this.setData({ savingVisibility: false }));
  },
});
