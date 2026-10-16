"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: { dashboard: null, loading: true, loadError: "" },
    onShow() { this.loadDashboard(); },
    async loadDashboard() {
        this.setData({ loading: true, loadError: "" });
        try {
            const dashboard = await (0, api_1.request)("/dashboard");
            dashboard.recentContacts = (dashboard.recentContacts || []).map(contact => ({ ...contact, initial: contact.name.charAt(0) }));
            this.setData({ dashboard, loading: false });
        }
        catch (error) {
            this.setData({ loading: false, loadError: error instanceof Error ? error.message : "本机数据读取失败" });
        }
    },
    goAdd() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
    goContacts() { wx.switchTab({ url: "/pages/contacts/index" }); },
    goMap() { wx.switchTab({ url: "/pages/map/index" }); },
    goAi() { wx.navigateTo({ url: "/pages/contact-form/index?mode=ai" }); },
    openContact(event) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
