import legal = require("../../utils/legal");

type DocKey = "privacy" | "terms";

Page({
  data: { docKey: "privacy" as DocKey, doc: legal.DOCS.privacy, canOpenWechatGuide: false },
  onLoad(query: Record<string, string>) {
    const docKey: DocKey = query.doc === "terms" ? "terms" : "privacy";
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
