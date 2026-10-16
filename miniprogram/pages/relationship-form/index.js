"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: {
        saving: false,
        sourceId: 0,
        contacts: [],
        source: null,
        targetIndex: 0,
        targetName: "暂无可选联系人",
        types: ["合作", "指导", "导师", "同事", "同学", "客户", "朋友"],
        typeIndex: 0,
        typeName: "合作",
        note: "",
    },
    async onLoad(query) {
        if (!query.sourceId) {
            wx.navigateBack();
            return;
        }
        try {
            const contacts = await (0, api_1.request)("/contacts");
            const sourceId = Number(query.sourceId);
            const candidates = contacts.filter((contact) => contact.id !== sourceId);
            this.setData({
                sourceId,
                contacts: candidates,
                source: contacts.find((contact) => contact.id === sourceId) || null,
                targetName: candidates[0]?.name || "暂无可选联系人",
            });
        }
        catch (error) {
            this.setData({ saving: false });
            (0, api_1.showError)(error);
        }
    },
    targetChange(event) {
        const targetIndex = Number(event.detail.value);
        this.setData({
            targetIndex,
            targetName: this.data.contacts[targetIndex].name,
        });
    },
    typeChange(event) {
        const typeIndex = Number(event.detail.value);
        this.setData({ typeIndex, typeName: this.data.types[typeIndex] });
    },
    noteInput(event) {
        this.setData({ note: event.detail.value });
    },
    async save() {
        if (this.data.saving)
            return;
        const target = this.data.contacts[this.data.targetIndex];
        if (!target)
            return wx.showToast({ title: "请先新增另一位联系人", icon: "none" });
        this.setData({ saving: true });
        try {
            await (0, api_1.request)("/relationships", "POST", {
                sourceId: this.data.sourceId,
                targetId: target.id,
                type: this.data.types[this.data.typeIndex],
                note: this.data.note,
            });
            wx.showToast({ title: "关系已建立", icon: "success" });
            setTimeout(() => wx.navigateBack(), 400);
        }
        catch (error) {
            this.setData({ saving: false });
            (0, api_1.showError)(error);
        }
    },
});
