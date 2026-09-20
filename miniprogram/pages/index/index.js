const { request } = require("../../utils/api");

Page({
  data: { dashboard: null, loading: true, loadError: "" },
  onShow() { this.loadDashboard(); },
  loadDashboard() {
    this.setData({ loading: true, loadError: "" });
    request("/dashboard").then((dashboard) => {
      dashboard.recentContacts = (dashboard.recentContacts || []).map((contact) => ({ ...contact, initial: contact.name ? contact.name.charAt(0) : "?" }));
      this.setData({ dashboard, loading: false });
    }).catch(() => this.setData({ loading: false, loadError: "登录或后端连接失败" }));
  },
  goAdd() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
  goContacts() { wx.switchTab({ url: "/pages/contacts/index" }); },
  goMap() { wx.switchTab({ url: "/pages/map/index" }); },
  goKnowledgeGraph() { wx.switchTab({ url: "/pages/knowledge-graph/index" }); },
  goAi() { wx.navigateTo({ url: "/pages/contact-form/index?mode=ai" }); },
  openContact(event) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
