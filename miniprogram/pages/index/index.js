"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const account_state_1 = require("../../utils/account-state");
Page({
    data: { dashboard: null, loading: true, loadError: "", backupNote: "资料保存在当前手机 · 记得定期备份", backupWarn: false },
    onShow() { this.loadDashboard(); },
    async loadDashboard() {
        this.setData({ loading: true, loadError: "" });
        try {
            const dashboard = await (0, api_1.request)("/dashboard");
            dashboard.recentContacts = (dashboard.recentContacts || []).map(contact => ({ ...contact, initial: contact.name.charAt(0) }));
            this.setData({ dashboard, loading: false });
            this.updateBackupNote(dashboard.contactCount);
        }
        catch (error) {
            this.setData({ loading: false, loadError: error instanceof Error ? error.message : "本机数据读取失败" });
        }
    },
    // The note turns into a warning when the data is not safely backed up.
    async updateBackupNote(contacts) {
        try {
            const status = (0, account_state_1.backupStatus)(await (0, api_1.getCurrentOwnerId)(), contacts);
            this.setData(status.backupWarning
                ? { backupNote: status.backupWarning, backupWarn: true }
                : { backupNote: `资料保存在当前手机 · 上次备份 ${status.lastBackup}`, backupWarn: false });
        }
        catch (_) { /* Keep the general reminder. */ }
    },
    goAdd() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
    goContacts() { wx.switchTab({ url: "/pages/contacts/index" }); },
    goMap() { wx.switchTab({ url: "/pages/map/index" }); },
    goGraph() { wx.switchTab({ url: "/pages/graph/index" }); },
    goBackup() { wx.navigateTo({ url: "/pages/data-backup/index" }); },
    goAi() { wx.navigateTo({ url: "/pages/contact-form/index?mode=ai" }); },
    openContact(event) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
