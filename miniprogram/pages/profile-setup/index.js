"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: {
        isEdit: false,
        saving: false,
        loading: false,
        loadFailed: false,
        dirty: false, resetAvatar: false, avatarUrl: "",
        avatars: [
            { type: "male-1", label: "男生 1" },
            { type: "male-2", label: "男生 2" },
            { type: "female-1", label: "女生 1" },
            { type: "female-2", label: "女生 2" },
        ],
        form: {
            nickname: "",
            organization: "",
            position: "",
            city: "",
            bio: "",
            avatarType: "male-1",
        },
    },
    savedForm: "",
    updateDirty() {
        const dirty = this.data.resetAvatar || JSON.stringify(this.data.form) !== this.savedForm;
        this.setData({ dirty });
        if (dirty && typeof wx.enableAlertBeforeUnload === "function")
            wx.enableAlertBeforeUnload({ message: "资料还未保存，离开会丢失修改。" });
        if (!dirty && typeof wx.disableAlertBeforeUnload === "function")
            wx.disableAlertBeforeUnload({});
    },
    resetDefaultAvatar() {
        if (this.data.loading || this.data.loadFailed || this.data.saving)
            return;
        this.setData({ resetAvatar: true });
        this.updateDirty();
    },
    onLoad(query) {
        const isEdit = query.mode === "edit";
        this.setData({ isEdit });
        this.savedForm = JSON.stringify(this.data.form);
        if (isEdit)
            this.load();
    },
    async load() {
        if (this.data.loading)
            return;
        this.setData({ loading: true, loadFailed: false });
        try {
            const profile = await (0, api_1.request)("/me");
            this.setData({
                avatarUrl: profile.avatarUrl || "", resetAvatar: false,
                form: {
                    nickname: profile.nickname || "",
                    organization: profile.organization || "",
                    position: profile.position || "",
                    city: profile.city || "",
                    bio: profile.bio || "",
                    avatarType: profile.avatarType || "male-1",
                },
            });
            this.savedForm = JSON.stringify(this.data.form);
            this.updateDirty();
        }
        catch (error) {
            this.setData({ loadFailed: true });
            (0, api_1.showError)(error);
        }
        finally {
            this.setData({ loading: false });
        }
    },
    input(event) {
        if (this.data.loading || this.data.loadFailed || this.data.saving)
            return;
        this.setData({
            [`form.${event.currentTarget.dataset.field}`]: event.detail.value,
        });
        this.updateDirty();
    },
    selectAvatar(event) {
        if (this.data.loading || this.data.loadFailed || this.data.saving)
            return;
        this.setData({ "form.avatarType": event.currentTarget.dataset.type, resetAvatar: true });
        this.updateDirty();
    },
    async save() {
        if (this.data.saving || this.data.loading || this.data.loadFailed)
            return;
        if (!this.data.form.nickname.trim())
            return wx.showToast({ title: "请填写昵称", icon: "none" });
        this.setData({ saving: true });
        try {
            await (0, api_1.request)("/me", "PATCH", {
                ...this.data.form,
                resetAvatar: this.data.resetAvatar,
                nickname: this.data.form.nickname.trim(),
            });
            this.setData({ resetAvatar: false });
            this.savedForm = JSON.stringify(this.data.form);
            this.updateDirty();
            wx.showToast({ title: "资料已保存", icon: "success" });
            setTimeout(() => this.data.isEdit
                ? wx.navigateBack()
                : wx.switchTab({ url: "/pages/index/index" }), 400);
        }
        catch (error) {
            this.setData({ saving: false });
            (0, api_1.showError)(error);
        }
    },
});
