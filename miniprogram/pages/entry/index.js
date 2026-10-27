"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const consent_1 = require("../../utils/consent");
Page({
    data: { checking: false },
    enterHome() {
        if (this.data.checking)
            return;
        if ((0, api_1.getPendingAccountDeletion)()) {
            wx.reLaunch({ url: "/pages/settings-security/index" });
            return;
        }
        // Existing users who have not agreed to the current terms confirm them on the login page.
        // After agreement, the login page reuses local identity without requiring a network login.
        if (!(0, consent_1.hasConsent)()) {
            wx.reLaunch({ url: "/pages/auth/index" });
            return;
        }
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
