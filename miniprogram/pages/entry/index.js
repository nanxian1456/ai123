"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: { checking: false },
    enterHome() {
        if (this.data.checking)
            return;
        this.setData({ checking: true });
        return (0, api_1.validateSession)()
            .then((profile) => {
            if ((0, api_1.hasProfileData)(profile)) {
                wx.reLaunch({ url: "/pages/index/index" });
                return;
            }
            (0, api_1.clearSession)();
            wx.reLaunch({ url: "/pages/auth/index" });
        })
            .catch((error) => {
            if (error.message !== "NO_SESSION" && error.message !== "SESSION_INVALID") {
                (0, api_1.showError)(error);
                return;
            }
            (0, api_1.clearSession)();
            wx.reLaunch({ url: "/pages/auth/index" });
        })
            .finally(() => this.setData({ checking: false }));
    }
});
