import { request, showError } from "../../utils/api";
Page({
  data: { contact: null as any, relationships: [] as any[] },
  onLoad(query: Record<string, string>) { if (query.id) this.loadContact(query.id); },
  onShow() { if (this.data.contact) this.loadRelationships(this.data.contact.id); },
  async loadContact(id: string) { try { const contact = await request<any>(`/contacts/${id}`); this.setData({ contact: { ...contact, initial: contact.name.charAt(0) } }); await this.loadRelationships(id); } catch (error) { showError(error); } },
  async loadRelationships(id: string | number) { try { this.setData({ relationships: await request<any[]>(`/contacts/${id}/relationships`) }); } catch (error) { showError(error); } },
  graph() { if (this.data.contact) wx.navigateTo({ url: `/pages/graph/index?id=${this.data.contact.id}` }); }, call() { const phone = this.data.contact?.phone; phone ? wx.makePhoneCall({ phoneNumber: phone }) : wx.showToast({ title: "暂无电话号码", icon: "none" }); }, edit() { if (this.data.contact) wx.navigateTo({ url: `/pages/contact-form/index?id=${this.data.contact.id}` }); }, addRelationship() { if (this.data.contact) wx.navigateTo({ url: `/pages/relationship-form/index?sourceId=${this.data.contact.id}` }); }, openOther(event: any) { wx.redirectTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); },
  removeRelationship(event: any) { const id = event.currentTarget.dataset.id; wx.showModal({ title: "删除关系", content: "删除后无法恢复，是否继续？", success: async result => { if (result.confirm) { try { await request(`/relationships/${id}`, "DELETE"); this.loadRelationships(this.data.contact.id); } catch (error) { showError(error); } } } }); },
  remove() { const contact = this.data.contact; if (!contact) return; wx.showModal({ title: "删除联系人", content: "联系人及其关联关系将被删除，是否继续？", success: async result => { if (result.confirm) { try { await request(`/contacts/${contact.id}`, "DELETE"); wx.showToast({ title: "已删除", icon: "success" }); setTimeout(() => wx.navigateBack(), 400); } catch (error) { showError(error); } } } }); }
});
