"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: { profile: null, needsSetup: false, uploading: false },
    onShow() { this.load(); },
    async load() {
        try {
            const profile = await (0, api_1.request)("/me");
            // Same rule as the entry page: never redirect automatically from a tab page, otherwise
            // pressing back from the setup page lands here and redirects again in a loop.
            this.setData({ profile, needsSetup: !(0, api_1.hasProfileData)(profile) });
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
    },
    edit() { wx.navigateTo({ url: "/pages/profile-setup/index?mode=edit" }); },
    changeAvatar() { if (this.data.uploading)
        return; wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], success: ({ tempFiles }) => { const file = tempFiles[0]; if (!file || file.size > 5 * 1024 * 1024)
            return wx.showToast({ title: "请选择不超过 5MB 的图片", icon: "none" }); this.setData({ uploading: true }); (0, api_1.uploadAvatar)(file.tempFilePath).then(profile => { this.setData({ profile }); wx.showToast({ title: "头像已更新", icon: "success" }); }).catch(api_1.showError).finally(() => this.setData({ uploading: false })); } }); }
});
