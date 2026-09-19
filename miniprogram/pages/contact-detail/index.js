const { request, showError } = require("../../utils/api");

Page({
  data: { contact: null, relationships: [] },
  onLoad(query) { if (query.id) this.loadContact(query.id); },
  onShow() { if (this.data.contact) this.loadRelationships(this.data.contact.id); },
  loadContact(id) { request(`/contacts/${id}`).then((contact) => { this.setData({ contact: { ...contact, initial: contact.name ? contact.name.charAt(0) : "?" } }); return this.loadRelationships(id); }).catch(showError); },
  loadRelationships(id) { return request(`/contacts/${id}/relationships`).then((relationships) => this.setData({ relationships })).catch(showError); },
  graph() { if (this.data.contact) wx.navigateTo({ url: `/pages/graph/index?id=${this.data.contact.id}` }); },
  call() { const phone = this.data.contact && this.data.contact.phone; phone ? wx.makePhoneCall({ phoneNumber: phone }) : wx.showToast({ title: "暂无电话号码", icon: "none" }); },
  edit() { if (this.data.contact) wx.navigateTo({ url: `/pages/contact-form/index?id=${this.data.contact.id}` }); },
  addRelationship() { if (this.data.contact) wx.navigateTo({ url: `/pages/relationship-form/index?sourceId=${this.data.contact.id}` }); },
  openOther(event) { wx.redirectTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); },
  removeRelationship(event) { const id = event.currentTarget.dataset.id; wx.showModal({ title: "删除关系", content: "删除后无法恢复，是否继续？", success: (result) => { if (result.confirm) request(`/relationships/${id}`, "DELETE").then(() => this.loadRelationships(this.data.contact.id)).catch(showError); } }); },
  remove() { const contact = this.data.contact; if (!contact) return; wx.showModal({ title: "删除联系人", content: "联系人及其关联关系将被删除，是否继续？", success: (result) => { if (result.confirm) request(`/contacts/${contact.id}`, "DELETE").then(() => { wx.showToast({ title: "已删除", icon: "success" }); setTimeout(() => wx.navigateBack(), 400); }).catch(showError); } }); }
});
