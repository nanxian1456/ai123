const { request, showError } = require("../../utils/api");

Page({
  data: { keyword: "", city: "", selectedTag: "", contacts: [], tags: [] },
  onShow() {
    const city = wx.getStorageSync("contact-filter-city") || this.data.city;
    wx.removeStorageSync("contact-filter-city");
    this.setData({ city }); this.loadTags(); this.loadContacts();
  },
  loadTags() { request("/tags").then((tags) => this.setData({ tags })).catch(showError); },
  loadContacts() {
    const params = [`keyword=${encodeURIComponent(this.data.keyword)}`];
    if (this.data.city) params.push(`city=${encodeURIComponent(this.data.city)}`);
    if (this.data.selectedTag) params.push(`tag=${encodeURIComponent(this.data.selectedTag)}`);
    request(`/contacts?${params.join("&")}`).then((contacts) => this.setData({ contacts: contacts.map((contact) => ({ ...contact, initial: contact.name ? contact.name.charAt(0) : "?" })) })).catch(showError);
  },
  onKeyword(event) { this.setData({ keyword: event.detail.value }); },
  search() { this.loadContacts(); },
  selectTag(event) { const tag = event.currentTarget.dataset.tag; this.setData({ selectedTag: this.data.selectedTag === tag ? "" : tag }); this.loadContacts(); },
  clearCity() { this.setData({ city: "" }); this.loadContacts(); },
  add() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
  detail(event) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
