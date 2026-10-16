import { request, showError } from "../../utils/api";

interface Contact { id: number; name: string; organization: string; position: string; city: string; tags: string[]; initial: string; }
interface Tag { name: string; count: number; }
const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const directoryGroups = (contacts: Contact[]) => {
  const groups = new Map<string, Contact[]>();
  contacts.forEach(contact => { const letter = LETTERS.includes(contact.initial) ? contact.initial : "#"; if (!groups.has(letter)) groups.set(letter, []); groups.get(letter)?.push({ ...contact, initial: contact.name ? contact.name.charAt(0) : "?" }); });
  return LETTERS.filter(letter => groups.has(letter)).map(letter => ({ letter, contacts: groups.get(letter) || [] }));
};

Page({
  data: { keyword: "", city: "", country: "", province: "", regionFilter: false, filterLabel: "", selectedTag: "", contacts: [] as Contact[], groups: [] as any[], tags: [] as Tag[], letters: LETTERS.map(letter => ({ letter, available: false })), scrollIntoView: "", activeLetter: "" },
  onShow() {
    const region = wx.getStorageSync("contact-filter-region") as { country: string; province: string; city: string } | undefined;
    const city = wx.getStorageSync("contact-filter-city") as string;
    wx.removeStorageSync("contact-filter-region");
    wx.removeStorageSync("contact-filter-city");
    if (region) this.setData({ ...region, regionFilter: true, filterLabel: [region.country || "未设置国家", region.province || "未设置省份", region.city || "未设置城市"].join(" / ") });
    else if (city) this.setData({ country: "", province: "", city, regionFilter: false, filterLabel: `城市：${city}` });
    this.loadTags(); this.loadContacts();
  },
  async loadTags() { try { this.setData({ tags: await request<Tag[]>("/tags") }); } catch (error) { showError(error); } },
  async loadContacts() { try { const params = [`keyword=${encodeURIComponent(this.data.keyword)}`]; if (this.data.regionFilter) { params.push(`country=${encodeURIComponent(this.data.country)}`, `province=${encodeURIComponent(this.data.province)}`, `city=${encodeURIComponent(this.data.city)}`); } else if (this.data.city) params.push(`city=${encodeURIComponent(this.data.city)}`); if (this.data.selectedTag) params.push(`tag=${encodeURIComponent(this.data.selectedTag)}`); const contacts = await request<Contact[]>(`/contacts/directory?${params.join("&")}`); const groups = directoryGroups(contacts); const available = new Set(groups.map(group => group.letter)); this.setData({ contacts, groups, letters: LETTERS.map(letter => ({ letter, available: available.has(letter) })), scrollIntoView: "" }); } catch (error) { showError(error); } },
  onKeyword(event: any) { this.setData({ keyword: event.detail.value }); },
  search() { this.loadContacts(); },
  selectTag(event: any) { const tag = event.currentTarget.dataset.tag; this.setData({ selectedTag: this.data.selectedTag === tag ? "" : tag }); this.loadContacts(); },
  clearCity() { this.setData({ country: "", province: "", city: "", regionFilter: false, filterLabel: "" }); this.loadContacts(); },
  jumpLetter(event: any) { const letter = event.currentTarget.dataset.letter; if (!this.data.letters.find(item => item.letter === letter && item.available)) return; this.setData({ scrollIntoView: "", activeLetter: letter }); setTimeout(() => this.setData({ scrollIntoView: `letter-${letter}` }), 0); },
  add() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
  detail(event: any) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
