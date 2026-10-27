"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const account_state_1 = require("../../utils/account-state");
Page({
    data: { loading: false, summaryError: "", publicationLabel: "", backupLabel: "", backupWarning: "" },
    loadId: 0,
    onUnload() { this.loadId++; },
    async onShow() {
        if ((0, api_1.getPendingAccountDeletion)()) {
            wx.redirectTo({ url: "/pages/settings-security/index" });
            return;
        }
        const id = ++this.loadId;
        this.setData({ loading: true, summaryError: "", publicationLabel: "", backupLabel: "", backupWarning: "" });
        try {
            const profile = await (0, api_1.request)("/me");
            if (id !== this.loadId)
                return;
            const summary = (0, account_state_1.accountSummary)(profile.ownerId);
            this.setData({ publicationLabel: (0, account_state_1.publicationView)(profile).title, backupLabel: summary.lastBackup, backupWarning: summary.backupWarning });
        }
        catch (error) {
            if (id === this.loadId)
                this.setData({ summaryError: error instanceof Error ? error.message : "状态暂时不可用" });
        }
        finally {
            if (id === this.loadId)
                this.setData({ loading: false });
        }
    },
    openProfile() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); },
    openSecurity() { wx.navigateTo({ url: "/pages/settings-security/index" }); },
    openFriends() { wx.navigateTo({ url: "/pages/settings-friends/index" }); },
    openPrivacy() { wx.navigateTo({ url: "/pages/settings-privacy/index" }); },
    openHelp() { wx.navigateTo({ url: "/pages/settings-help/index" }); },
});
