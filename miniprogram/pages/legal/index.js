"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const legal = require("../../utils/legal");
Page({
    data: { docKey: "privacy", doc: legal.DOCS.privacy, canOpenWechatGuide: false },
    onLoad(query) {
        const docKey = query.doc === "terms" ? "terms" : "privacy";
        const doc = legal.DOCS[docKey];
        this.setData({
            docKey,
            doc,
            canOpenWechatGuide: docKey === "privacy" && typeof wx.openPrivacyContract === "function",
        });
        wx.setNavigationBarTitle({ title: doc.title });
    },
    openWechatGuide() {
        if (typeof wx.openPrivacyContract === "function")
            wx.openPrivacyContract({ fail: () => wx.showToast({ title: "暂时无法打开，请稍后重试", icon: "none" }) });
    },
});
