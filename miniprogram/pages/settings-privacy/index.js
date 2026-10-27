"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const consent_1 = require("../../utils/consent");
const account_state_1 = require("../../utils/account-state");
Page({
    data: {
        profile: null,
        aiConsent: false, withdrawalOptions: false,
        loading: true, loadError: "", publication: (0, account_state_1.publicationView)(null),
    },
    onShow() {
        this.setData({ aiConsent: (0, consent_1.hasAiConsent)() });
        return this.load();
    },
    openTerms() {
        wx.navigateTo({ url: "/pages/legal/index?doc=terms" });
    },
    openPolicy() {
        wx.navigateTo({ url: "/pages/legal/index?doc=privacy" });
    },
    openWechatGuide() {
        if (typeof wx.openPrivacyContract === "function")
            wx.openPrivacyContract({ fail: () => wx.showToast({ title: "隐私指引暂时无法打开", icon: "none" }) });
        else
            wx.showToast({ title: "请更新微信后查看", icon: "none" });
    },
    withdrawAi() {
        if (!this.data.aiConsent)
            return;
        wx.showModal({
            title: "撤回 AI 智能整理授权",
            content: "撤回后不会再向 DeepSeek 发送文字，下次使用智能整理时会重新询问。已识别并保存的联系人不受影响。",
            confirmText: "撤回",
            success: (result) => {
                if (!result.confirm)
                    return;
                try {
                    (0, consent_1.withdrawAiConsent)();
                    this.setData({ aiConsent: false });
                    wx.showToast({ title: "已撤回", icon: "success" });
                }
                catch (error) {
                    this.setData({ aiConsent: (0, consent_1.hasAiConsent)() });
                    (0, api_1.showError)(error);
                }
            },
        });
    },
    withdrawAll() { this.setData({ withdrawalOptions: true }); },
    cancelWithdrawal() { this.setData({ withdrawalOptions: false }); },
    confirmWithdrawAll() {
        wx.showModal({
            title: "撤回全部同意",
            content: "撤回后将退出登录，需重新同意《用户协议》和《隐私政策》才能继续使用。本机的联系人和资料不会被删除；如需删除服务器上的公开资料，请先关闭公开昵称。",
            confirmText: "撤回退出",
            confirmColor: "#d92d20",
            success: (result) => {
                if (!result.confirm)
                    return;
                try {
                    (0, consent_1.withdrawConsent)();
                    (0, api_1.clearSession)();
                    wx.reLaunch({ url: "/pages/entry/index" });
                }
                catch (error) {
                    this.setData({ aiConsent: (0, consent_1.hasAiConsent)() });
                    (0, api_1.showError)(error);
                }
            },
        });
    },
    async load() {
        this.setData({ loading: true, loadError: "" });
        try {
            const profile = await (0, api_1.request)("/me");
            this.setData({ profile, publication: (0, account_state_1.publicationView)(profile) });
        }
        catch (error) {
            this.setData({ loadError: error instanceof Error ? error.message : "隐私设置读取失败，请重试" });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    // Which fields are public is managed together with the import code.
    openPublication() { wx.navigateTo({ url: "/pages/settings-friends/index" }); },
});
