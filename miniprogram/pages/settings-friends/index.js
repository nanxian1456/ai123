"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const account_state_1 = require("../../utils/account-state");
// The import code and the fields it shares are managed on this one page.
const VISIBILITY_FIELDS = [
    { field: "nickname", label: "昵称" },
    { field: "organization", label: "单位" },
    { field: "position", label: "职务" },
    { field: "city", label: "城市" },
    { field: "bio", label: "个人简介" },
];
const PRIVATE_VISIBILITY = { avatar: false, nickname: false, organization: false, position: false, city: false, bio: false };
const normalizeProfile = (profile) => ({ ...profile, visibility: { ...PRIVATE_VISIBILITY, ...(profile.visibility || {}) } });
const visibilityItems = (visibility) => VISIBILITY_FIELDS.map(item => ({ ...item, enabled: visibility[item.field] }));
Page({
    data: { resetting: false, previewLoading: false, preview: null, previewError: "", contactCode: "", profile: null, publishing: false, savingVisibility: false, visibilityItems: [], profileLoading: true, profileError: "", codeLoading: true, codeError: "", codeFromCache: false, publication: (0, account_state_1.publicationView)(null) },
    loadId: 0,
    onShow() { return this.load(); },
    onUnload() { this.loadId++; },
    async load() {
        const current = ++this.loadId;
        const owner = wx.getStorageSync("ai-network-owner-id");
        const checkOwner = () => { if (owner !== wx.getStorageSync("ai-network-owner-id"))
            throw new Error("账号已切换，请重新加载导入码"); };
        this.setData({ preview: null, profile: null, contactCode: "", profileLoading: true, profileError: "", codeLoading: true, codeError: "", codeFromCache: false });
        const profileTask = (0, api_1.request)("/me").then(loaded => {
            if (current !== this.loadId)
                return;
            checkOwner();
            const profile = normalizeProfile(loaded);
            this.setData({ profile, publication: (0, account_state_1.publicationView)(profile), visibilityItems: visibilityItems(profile.visibility) });
            if (/^\d{3}[A-Z]{2}\d{3}$/.test(profile.contactCode || ""))
                this.setData({ contactCode: profile.contactCode, codeFromCache: true });
        }).catch(error => { if (current === this.loadId)
            this.setData({ profileError: error instanceof Error ? error.message : "个人资料读取失败" }); })
            .finally(() => { if (current === this.loadId)
            this.setData({ profileLoading: false }); });
        await profileTask;
        if (current !== this.loadId)
            return;
        try {
            checkOwner();
            const contactCode = await (0, api_1.request)("/me/import-code");
            if (current !== this.loadId)
                return;
            checkOwner();
            if (!/^\d{3}[A-Z]{2}\d{3}$/.test(contactCode || ""))
                throw new Error("服务未返回有效导入码，请重试");
            this.setData({ contactCode, codeFromCache: false });
        }
        catch (error) {
            if (current === this.loadId)
                this.setData({ codeError: error instanceof Error ? error.message : "导入码暂时无法获取" });
        }
        finally {
            if (current === this.loadId)
                this.setData({ codeLoading: false });
        }
    },
    async previewPublic() {
        if (this.data.previewLoading || this.data.savingVisibility || this.data.publishing || this.data.resetting)
            return;
        this.setData({ previewLoading: true, preview: null, previewError: "" });
        try {
            this.setData({ preview: await (0, api_1.request)("/me/published-profile") });
        }
        catch (error) {
            this.setData({ previewError: error instanceof Error ? error.message : "公开资料预览失败" });
        }
        finally {
            this.setData({ previewLoading: false });
        }
    },
    resetCode() {
        if (this.data.resetting || this.data.publishing || this.data.savingVisibility || this.data.codeLoading || this.data.previewLoading)
            return;
        wx.showModal({ title: "重置导入码", content: "旧码将立即失效，新码需要重新分享。已被他人导入的资料不会删除，公开字段保持不变。需要联网并验证微信身份。", confirmText: "重置",
            success: async (result) => {
                if (!result.confirm || this.data.resetting)
                    return;
                this.setData({ resetting: true });
                try {
                    const contactCode = await (0, api_1.resetImportCode)();
                    this.setData({ contactCode, codeFromCache: false, codeError: "" });
                    wx.showToast({ title: "导入码已重置", icon: "success" });
                }
                catch (error) {
                    this.setData({ contactCode: "", codeFromCache: false, codeError: error instanceof Error ? error.message : "请重新获取导入码" });
                    (0, api_1.showError)(error);
                }
                finally {
                    this.setData({ resetting: false });
                }
            } });
    },
    copyCode() {
        if (this.data.contactCode)
            wx.setClipboardData({ data: this.data.contactCode, fail: () => (0, api_1.showError)(new Error("复制未完成，请重试")) });
    },
    changeVisibility(event) {
        if (this.data.savingVisibility || this.data.publishing || this.data.resetting || this.data.previewLoading || !this.data.profile)
            return;
        const visibility = { ...this.data.profile.visibility, [event.currentTarget.dataset.field]: event.detail.value };
        this.setData({ preview: null, "profile.visibility": visibility, visibilityItems: visibilityItems(visibility), savingVisibility: true });
        (0, api_1.request)("/me/visibility", "PATCH", visibility)
            .then(profile => {
            const normalized = normalizeProfile(profile);
            this.setData({ profile: normalized, visibilityItems: visibilityItems(normalized.visibility), publication: (0, account_state_1.publicationView)(normalized) });
        })
            .catch(error => { this.load(); (0, api_1.showError)(error); })
            .finally(() => this.setData({ savingVisibility: false }));
    },
    async publish() {
        if (this.data.publishing || this.data.savingVisibility || this.data.resetting || this.data.previewLoading || !this.data.profile)
            return;
        this.setData({ publishing: true });
        try {
            await (0, api_1.syncPublishedProfile)(this.data.profile);
            wx.showToast({ title: "公开资料已更新", icon: "success" });
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
        finally {
            await this.load();
            this.setData({ publishing: false });
        }
    },
});
