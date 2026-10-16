// 微信隐私授权弹窗。页面调用剪贴板、相册/相机、聊天文件等隐私接口而用户尚未同意
// 《小程序隐私保护指引》时，微信触发 onNeedPrivacyAuthorization，由本组件展示说明，
// 用户点击「同意」（open-type="agreePrivacyAuthorization"）后原接口调用继续执行。
// 该监听是全局唯一的，所以每次页面显示时由当前页面的组件重新注册。
Component({
  data: { show: false, contractName: "《小程序隐私保护指引》" },
  lifetimes: {
    attached() { this.listen(); },
    detached() { this.finish({ event: "disagree" }); }
  },
  pageLifetimes: {
    show() { this.listen(); }
  },
  methods: {
    listen() {
      if (typeof wx.onNeedPrivacyAuthorization !== "function") return;
      wx.onNeedPrivacyAuthorization((resolve) => {
        if (this.resolvePrivacy) this.resolvePrivacy({ event: "disagree" });
        this.resolvePrivacy = resolve;
        this.setData({ show: true });
      });
      if (typeof wx.getPrivacySetting === "function") {
        wx.getPrivacySetting({
          success: (result) => {
            if (result && result.privacyContractName) this.setData({ contractName: result.privacyContractName });
          }
        });
      }
    },
    finish(result) {
      const resolve = this.resolvePrivacy;
      this.resolvePrivacy = null;
      if (this.data.show) this.setData({ show: false });
      if (resolve) resolve(result);
    },
    openContract() {
      if (typeof wx.openPrivacyContract === "function") wx.openPrivacyContract({});
    },
    openPolicy() {
      wx.navigateTo({ url: "/pages/legal/index?doc=privacy" });
    },
    agree() { this.finish({ buttonId: "privacy-agree", event: "agree" }); },
    disagree() {
      this.finish({ event: "disagree" });
      wx.showToast({ title: "未同意，无法使用该功能", icon: "none" });
    },
    noop() {}
  }
});
