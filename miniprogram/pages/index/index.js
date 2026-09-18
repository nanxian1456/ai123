const BASE_URL = "http://127.0.0.1:8080/api";
Page({
  data: { dashboard: null, loading: true, loadError: "" },
  onShow() { this.loadDashboard(); },
  loadDashboard() { this.setData({ loading: true, loadError: "" }); wx.request({ url: `${BASE_URL}/dashboard`, header: { "content-type": "application/json", "X-User-Id": "demo" }, success: (response) => { if (response.statusCode >= 200 && response.statusCode < 300) { const dashboard = response.data; dashboard.recentContacts = (dashboard.recentContacts || []).map((contact) => ({ ...contact, initial: contact.name ? contact.name.charAt(0) : "?" })); this.setData({ dashboard, loading: false }); } else this.setData({ loading: false, loadError: "数据暂时无法加载" }); }, fail: () => this.setData({ loading: false, loadError: "后端未连接，请先启动 Java 服务" }) }); },
  goAdd() { wx.navigateTo({ url: "/pages/contact-form/index" }); }, goContacts() { wx.switchTab({ url: "/pages/contacts/index" }); }, goMap() { wx.switchTab({ url: "/pages/map/index" }); }, goAi() { wx.navigateTo({ url: "/pages/contact-form/index?mode=ai" }); }, openContact(event) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
