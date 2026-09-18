import { request, showError } from "../../utils/api";
interface Contact { id: number; name: string; organization: string; position: string; city: string; province: string; phone: string; email: string; note: string; tags: string[]; initial?: string; }
interface Relationship { id: number; label: string; summary: string; other: { id: number; name: string; organization: string }; }
Page({
  data: { contact: null as Contact | null, relationships: [] as Relationship[] },
  onLoad(query: Record<string, string>) { if (query.id) this.loadContact(query.id); },
  async loadContact(id: string) { try { const contact = await request<Contact>(`/contacts/${id}`); this.setData({ contact: { ...contact, initial: contact.name.charAt(0) } }); this.loadRelationships(id); } catch (error) { showError(error); } },
  async loadRelationships(id: string) { try { this.setData({ relationships: await request<Relationship[]>(`/contacts/${id}/relationships`) }); } catch (error) { showError(error); } },
  graph() { const contact = this.data.contact; if (contact) wx.navigateTo({ url: `/pages/graph/index?id=${contact.id}` }); },
  call() { const contact = this.data.contact; if (contact?.phone) wx.makePhoneCall({ phoneNumber: contact.phone }); else wx.showToast({ title: "暂无电话号码", icon: "none" }); },
  edit() { const contact = this.data.contact; if (contact) wx.navigateTo({ url: `/pages/contact-form/index?id=${contact.id}` }); },
  addRelationship() { const contact = this.data.contact; if (contact) wx.navigateTo({ url: `/pages/relationship-form/index?sourceId=${contact.id}` }); },
  openOther(event: any) { wx.redirectTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); },
  removeRelationship(event: any) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({ title: "删除关系", content: "删除后无法恢复，是否继续？", success: async result => { if (result.confirm) { try { await request(`/relationships/${id}`, "DELETE"); const contact = this.data.contact; if (contact) this.loadRelationships(String(contact.id)); } catch (error) { showError(error); } } } });
  },
  remove() {
    const contact = this.data.contact; if (!contact) return;
    wx.showModal({ title: "删除联系人", content: "联系人及其关联关系将被删除，是否继续？", success: async result => { if (result.confirm) { try { await request(`/contacts/${contact.id}`, "DELETE"); wx.showToast({ title: "已删除", icon: "success" }); setTimeout(() => wx.navigateBack(), 500); } catch (error) { showError(error); } } } });
  }
});
