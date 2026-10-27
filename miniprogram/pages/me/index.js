"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const account_state_1 = require("../../utils/account-state");
const avatar_1 = require("../../utils/avatar");
Page({
    data: { profile: null, needsSetup: false, uploading: false, loading: true, loadError: "", summaryError: "", storageExpanded: false,
        publication: (0, account_state_1.publicationView)(null), contacts: 0, relationships: 0, storageLabel: "", storageWarning: false, lastBackup: "", backupWarning: "", backupUnsaved: false,
        avatarPreview: "", avatarPreparing: false, avatarSizeLabel: "" },
    loadId: 0,
    avatarOwner: "",
    onShow() {
        if ((0, api_1.getPendingAccountDeletion)()) {
            wx.reLaunch({ url: "/pages/settings-security/index" });
            return;
        }
        return this.load();
    },
    onUnload() { this.loadId++; this.avatarOwner = ""; },
    async load() {
        const current = ++this.loadId;
        const requestedOwner = typeof wx.getStorageSync === "function" ? wx.getStorageSync("ai-network-owner-id") : "";
        if (this.data.profile?.ownerId && requestedOwner !== this.data.profile.ownerId) {
            this.avatarOwner = "";
            this.setData({ profile: null, avatarPreview: "", storageExpanded: false });
        }
        this.setData({ loading: true, loadError: "", summaryError: "" });
        try {
            const profile = await (0, api_1.request)("/me");
            if (current !== this.loadId)
                return;
            if (requestedOwner && requestedOwner !== wx.getStorageSync("ai-network-owner-id"))
                throw new Error("账号已切换，请重新加载个人资料");
            this.setData({ profile, needsSetup: !(0, api_1.hasProfileData)(profile), publication: (0, account_state_1.publicationView)(profile) });
            try {
                this.setData((0, account_state_1.accountSummary)(profile.ownerId));
                const avatarSizeLabel = await (0, account_state_1.avatarUsage)(profile.ownerId);
                if (current === this.loadId)
                    this.setData({ avatarSizeLabel });
            }
            catch (error) {
                this.setData({ summaryError: error instanceof Error ? error.message : "本机统计暂不可用" });
            }
        }
        catch (error) {
            if (current === this.loadId)
                this.setData({ loadError: error instanceof Error ? error.message : "个人资料读取失败，请重试" });
        }
        finally {
            if (current === this.loadId)
                this.setData({ loading: false });
        }
    },
    edit() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); },
    toggleStorageDetails() { this.setData({ storageExpanded: !this.data.storageExpanded }); },
    openBackup() { wx.navigateTo({ url: "/pages/data-backup/index" }); },
    openFriends() { wx.navigateTo({ url: "/pages/settings-friends/index" }); },
    openSecurity() { wx.navigateTo({ url: "/pages/settings-security/index" }); },
    openPrivacy() { wx.navigateTo({ url: "/pages/settings-privacy/index" }); },
    async onAvatarChosen(event) {
        if (this.data.uploading || this.data.avatarPreparing || !this.data.profile)
            return;
        const path = event.detail?.avatarUrl;
        if (!path)
            return;
        const owner = this.data.profile.ownerId;
        this.setData({ avatarPreparing: true, avatarPreview: "" });
        try {
            const avatarPreview = await (0, avatar_1.prepareAvatar)(path);
            if (owner !== wx.getStorageSync("ai-network-owner-id"))
                throw new Error("账号已切换，请重新选择头像");
            this.avatarOwner = owner;
            this.setData({ avatarPreview });
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
        finally {
            this.setData({ avatarPreparing: false });
        }
    },
    cancelAvatar() { if (!this.data.uploading) {
        this.avatarOwner = "";
        this.setData({ avatarPreview: "" });
    } },
    async saveAvatar() {
        if (this.data.uploading || !this.data.avatarPreview || !this.avatarOwner)
            return;
        this.setData({ uploading: true });
        try {
            const profile = await (0, api_1.uploadAvatar)(this.data.avatarPreview, this.avatarOwner);
            this.setData({ profile, avatarPreview: "" });
            this.avatarOwner = "";
            this.setData({ avatarSizeLabel: await (0, account_state_1.avatarUsage)(profile.ownerId) });
            wx.showToast({ title: "头像已更新", icon: "success" });
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
        finally {
            this.setData({ uploading: false });
        }
    },
});
