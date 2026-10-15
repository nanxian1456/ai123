"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: { loggingIn: false },
    login() {
        if (this.data.loggingIn)
            return;
        this.setData({ loggingIn: true });
        return (0, api_1.ensureSession)(true)
            .then(() => (0, api_1.request)("/me"))
            .then(profile => {
            if ((0, api_1.hasProfileData)(profile))
                wx.switchTab({ url: "/pages/index/index" });
            else
                wx.redirectTo({ url: "/pages/profile-setup/index" });
        })
            .catch(api_1.showError)
            .finally(() => this.setData({ loggingIn: false }));
    }
});
