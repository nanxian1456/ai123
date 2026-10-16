"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({
    data: { contactCode: "", profile: null, publishing: false },
    onShow() {
        Promise.all([(0, api_1.request)("/me/import-code"), (0, api_1.request)("/me")])
            .then(([contactCode, profile]) => this.setData({ contactCode, profile }))
            .catch(api_1.showError);
    },
    copyCode() {
        if (this.data.contactCode)
            wx.setClipboardData({ data: this.data.contactCode });
    },
    publish() {
        if (this.data.publishing || !this.data.profile)
            return;
        this.setData({ publishing: true });
        (0, api_1.syncPublishedProfile)(this.data.profile)
            .then(() => wx.showToast({ title: "公开资料已更新", icon: "success" }))
            .catch(api_1.showError)
            .finally(() => {
            this.onShow();
            this.setData({ publishing: false });
        });
    },
});
