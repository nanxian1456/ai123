"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const api_config_1 = require("../../utils/api-config");
const consent_1 = require("../../utils/consent");
Page({
    data: { loggingIn: false, bgVideo: "", agreed: false },
    onLoad() {
        // Served by the backend; if it is missing or unreachable the gradient background remains.
        this.setData({ bgVideo: (0, api_config_1.getMediaUrl)("/videos/background.mp4"), agreed: (0, consent_1.hasConsent)() });
    },
    onVideoError() {
        this.setData({ bgVideo: "" });
    },
    toggleAgree() {
        if (!this.data.loggingIn)
            this.setData({ agreed: !this.data.agreed });
    },
    openTerms() {
        wx.navigateTo({ url: "/pages/legal/index?doc=terms" });
    },
    openPrivacy() {
        wx.navigateTo({ url: "/pages/legal/index?doc=privacy" });
    },
    login() {
        if (this.data.loggingIn)
            return;
        if (!this.data.agreed)
            return wx.showToast({ title: "请先阅读并同意用户协议和隐私政策", icon: "none" });
        try {
            (0, consent_1.recordConsent)();
        }
        catch (error) {
            return (0, api_1.showError)(error);
        }
        this.setData({ loggingIn: true });
        return (0, api_1.validateSession)()
            .catch((error) => {
            const code = error.code || error.message;
            if (code !== "NO_SESSION" && code !== "SESSION_INVALID")
                throw error;
            return (0, api_1.ensureSession)(true).then(() => (0, api_1.request)("/me"));
        })
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
