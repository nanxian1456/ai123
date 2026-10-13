"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: { contact: null, relationships: [] },
    onLoad(query) {
        if (query.id)
            this.loadContact(query.id);
    },
    onShow() {
        if (this.data.contact)
            this.loadContact(String(this.data.contact.id));
    },
    async loadContact(id) {
        try {
            const contact = await (0, api_1.request)(`/contacts/${id}`);
            this.setData({
                contact: {
                    ...contact,
                    initial: contact.name ? contact.name.charAt(0) : "?",
                },
            });
            await this.loadRelationships(id);
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
    },
    async loadRelationships(id) {
        try {
            this.setData({
                relationships: await (0, api_1.request)(`/contacts/${id}/relationships`),
            });
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
    },
    call() {
        const phone = this.data.contact?.phone;
        phone
            ? wx.makePhoneCall({ phoneNumber: phone })
            : wx.showToast({ title: "暂无电话号码", icon: "none" });
    },
    edit() {
        if (this.data.contact)
            wx.navigateTo({
                url: `/pages/contact-form/index?id=${this.data.contact.id}`,
            });
    },
    addRelationship() {
        if (this.data.contact)
            wx.navigateTo({
                url: `/pages/relationship-form/index?sourceId=${this.data.contact.id}`,
            });
    },
    openOther(event) {
        wx.redirectTo({
            url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}`,
        });
    },
    removeRelationship(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: "删除关系",
            content: "删除后无法恢复，是否继续？",
            success: async (result) => {
                if (result.confirm) {
                    try {
                        await (0, api_1.request)(`/relationships/${id}`, "DELETE");
                        this.loadRelationships(this.data.contact.id);
                    }
                    catch (error) {
                        (0, api_1.showError)(error);
                    }
                }
            },
        });
    },
    remove() {
        const contact = this.data.contact;
        if (!contact)
            return;
        wx.showModal({
            title: "删除联系人",
            content: "联系人及其关联关系将被删除，是否继续？",
            success: async (result) => {
                if (result.confirm) {
                    try {
                        await (0, api_1.request)(`/contacts/${contact.id}`, "DELETE");
                        wx.showToast({ title: "已删除", icon: "success" });
                        setTimeout(() => wx.navigateBack(), 400);
                    }
                    catch (error) {
                        (0, api_1.showError)(error);
                    }
                }
            },
        });
    },
});
