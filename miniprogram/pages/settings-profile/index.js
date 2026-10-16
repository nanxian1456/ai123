"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: { profile: null, profileInitial: "我" },
    onShow() { this.load(); },
    async load() {
        try {
            const profile = await (0, api_1.request)("/me");
            this.setData({ profile, profileInitial: profile.nickname ? profile.nickname.slice(0, 1) : "我" });
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
    },
    editProfile() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); }
});
