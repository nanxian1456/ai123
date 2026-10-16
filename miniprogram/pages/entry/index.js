"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const api_config_1 = require("../../utils/api-config");
const consent_1 = require("../../utils/consent");
// Put the entry animation at backend/src/main/resources/static/videos/entry.mp4.
// Until it exists the shared login background is used, then a plain gradient.
const VIDEO_CANDIDATES = ["/videos/entry.mp4", "/videos/background.mp4"];
Page({
    data: { checking: false, bgVideo: "" },
    videoIndex: 0,
    onLoad() {
        this.videoIndex = 0;
        this.setData({ bgVideo: (0, api_config_1.getMediaUrl)(VIDEO_CANDIDATES[0]) });
    },
    onVideoError() {
        this.videoIndex += 1;
        const next = VIDEO_CANDIDATES[this.videoIndex];
        this.setData({ bgVideo: next ? (0, api_config_1.getMediaUrl)(next) : "" });
    },
    enterHome() {
        if (this.data.checking)
            return;
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
