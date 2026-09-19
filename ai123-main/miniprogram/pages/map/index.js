const { request, showError } = require("../../utils/api");

Page({
  data: { cities: [], total: 0, topCity: "--" },
  onShow() { this.load(); },
  load() { request("/maps/cities").then((cities) => { const total = cities.reduce((sum, city) => sum + city.count, 0); const sorted = cities.slice().sort((a, b) => b.count - a.count).map((city) => ({ ...city, percent: total ? Math.round(city.count / total * 100) : 0 })); this.setData({ cities: sorted, total, topCity: sorted[0] ? sorted[0].name : "--" }); }).catch(showError); },
  contacts(event) { wx.setStorageSync("contact-filter-city", event.currentTarget.dataset.city); wx.switchTab({ url: "/pages/contacts/index" }); }
});
