import { request, showError } from "../../utils/api";

interface Contact { id: number; name: string; organization: string; position: string; city: string; tags: string[]; initial?: string; }
interface Tag { name: string; count: number; }
Page({
  data: { keyword: "", city: "", selectedTag: "", contacts: [] as Contact[], tags: [] as Tag[] },
  onShow() { const city = wx.getStorageSync("contact-filter-city") || this.data.city; wx.removeStorageSync("contact-filter-city"); this.setData({ city }); this.loadTags(); this.loadContacts(); },
  async loadTags() { try { this.setData({ tags: await request<Tag[]>("/tags") }); } catch (error) { showError(error); } },
  async loadContacts() { try { const params = [`keyword=${encodeURIComponent(this.data.keyword)}`]; if (this.data.city) params.push(`city=${encodeURIComponent(this.data.city)}`); if (this.data.selectedTag) params.push(`tag=${encodeURIComponent(this.data.selectedTag)}`); const contacts = await request<Contact[]>(`/contacts?${params.join("&")}`); this.setData({ contacts: contacts.map(contact => ({ ...contact, initial: contact.name.charAt(0) })) }); } catch (error) { showError(error); } },
  onKeyword(event: any) { this.setData({ keyword: event.detail.value }); },
  search() { this.loadContacts(); },
  selectTag(event: any) { const tag = event.currentTarget.dataset.tag; this.setData({ selectedTag: this.data.selectedTag === tag ? "" : tag }); this.loadContacts(); },
  clearCity() { this.setData({ city: "" }); this.loadContacts(); },
  add() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
  detail(event: any) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
