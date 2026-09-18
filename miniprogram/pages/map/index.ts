import { request, showError } from "../../utils/api";
interface City { name: string; count: number; percent?: number; }
Page({
  data: { cities: [] as City[], total: 0 },
  onShow() { this.load(); },
  async load() { try { const cities = await request<City[]>("/maps/cities"); const total = cities.reduce((sum, item) => sum + item.count, 0); this.setData({ cities: cities.map(item => ({ ...item, percent: total ? Math.round((item.count / total) * 100) : 0 })), total }); } catch (error) { showError(error); } },
  contacts(event: any) { wx.setStorageSync("contact-filter-city", event.currentTarget.dataset.city); wx.switchTab({ url: "/pages/contacts/index" }); }
});
