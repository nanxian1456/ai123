import { request, uploadAvatar, hasProfileData, showError, getPendingAccountDeletion } from "../../utils/api";
import { accountSummary, publicationView, avatarUsage } from "../../utils/account-state";
import { prepareAvatar } from "../../utils/avatar";

Page({
  data: { profile: null as any, needsSetup: false, uploading: false, loading: true, loadError: "", summaryError: "", storageExpanded: false,
    publication: publicationView(null), contacts: 0, relationships: 0, storageLabel: "", storageWarning: false, lastBackup: "", backupWarning: "", backupUnsaved: false,
    avatarPreview: "", avatarPreparing: false, avatarSizeLabel: "" },
  loadId: 0,
  avatarOwner: "",
  onShow() {
    if (getPendingAccountDeletion()) { wx.reLaunch({ url: "/pages/settings-security/index" }); return; }
    return this.load();
  },
  onUnload() { this.loadId++; this.avatarOwner = ""; },
  async load() {
    const current = ++this.loadId;
    const requestedOwner = typeof wx.getStorageSync === "function" ? wx.getStorageSync("ai-network-owner-id") : "";
    if (this.data.profile?.ownerId && requestedOwner !== this.data.profile.ownerId) {
      this.avatarOwner = ""; this.setData({ profile: null, avatarPreview: "", storageExpanded: false });
    }
    this.setData({ loading: true, loadError: "", summaryError: "" });
    try {
      const profile = await request<any>("/me");
      if (current !== this.loadId) return;
      if (requestedOwner && requestedOwner !== wx.getStorageSync("ai-network-owner-id")) throw new Error("账号已切换，请重新加载个人资料");
      this.setData({ profile, needsSetup: !hasProfileData(profile), publication: publicationView(profile) });
      try {
        this.setData(accountSummary(profile.ownerId));
        const avatarSizeLabel = await avatarUsage(profile.ownerId);
        if (current === this.loadId) this.setData({ avatarSizeLabel });
      }
      catch (error) { this.setData({ summaryError: error instanceof Error ? error.message : "本机统计暂不可用" }); }
    } catch (error) {
      if (current === this.loadId) this.setData({ loadError: error instanceof Error ? error.message : "个人资料读取失败，请重试" });
    } finally { if (current === this.loadId) this.setData({ loading: false }); }
  },
  edit() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); },
  toggleStorageDetails() { this.setData({ storageExpanded: !this.data.storageExpanded }); },
  openBackup() { wx.navigateTo({ url: "/pages/data-backup/index" }); },
  openFriends() { wx.navigateTo({ url: "/pages/settings-friends/index" }); },
  openSecurity() { wx.navigateTo({ url: "/pages/settings-security/index" }); },
  openPrivacy() { wx.navigateTo({ url: "/pages/settings-privacy/index" }); },
  async onAvatarChosen(event: any) {
    if (this.data.uploading || this.data.avatarPreparing || !this.data.profile) return;
    const path = event.detail?.avatarUrl;
    if (!path) return;
    const owner = this.data.profile.ownerId;
    this.setData({ avatarPreparing: true, avatarPreview: "" });
    try {
      const avatarPreview = await prepareAvatar(path);
      if (owner !== wx.getStorageSync("ai-network-owner-id")) throw new Error("账号已切换，请重新选择头像");
      this.avatarOwner = owner;
      this.setData({ avatarPreview });
    } catch (error) { showError(error); }
    finally { this.setData({ avatarPreparing: false }); }
  },
  cancelAvatar() { if (!this.data.uploading) { this.avatarOwner = ""; this.setData({ avatarPreview: "" }); } },
  async saveAvatar() {
    if (this.data.uploading || !this.data.avatarPreview || !this.avatarOwner) return;
    this.setData({ uploading: true });
    try {
      const profile = await uploadAvatar<any>(this.data.avatarPreview, this.avatarOwner);
      this.setData({ profile, avatarPreview: "" }); this.avatarOwner = "";
      this.setData({ avatarSizeLabel: await avatarUsage(profile.ownerId) });
      wx.showToast({ title: "头像已更新", icon: "success" });
    } catch (error) { showError(error); }
    finally { this.setData({ uploading: false }); }
  },
});
