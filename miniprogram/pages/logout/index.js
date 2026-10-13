"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: { loggingOut: false },
    cancel() { wx.navigateBack(); },
    confirmLogout() { if (this.data.loggingOut)
        return; this.setData({ loggingOut: true }); (0, api_1.clearSession)(); wx.reLaunch({ url: "/pages/auth/index" }); }
});
