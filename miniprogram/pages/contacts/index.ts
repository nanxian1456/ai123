import { request, showError } from "../../utils/api";
import { filterTags } from "../../utils/contact-tags";

interface Contact { id: number; name: string; organization: string; position: string; city: string; tags: string[]; initial: string; }
interface Tag { name: string; count: number; }
// Only what a list row shows. Notes, phone, e-mail, address and categories stay out of setData,
// which is limited to 1MB per call and would fail for a few hundred contacts with long notes.
interface Row { id: number; name: string; initial: string; organization: string; position: string; city: string; tags: string[]; moreTags: number; }
interface Section { key: string; letter: string; first: boolean; last: boolean; contacts: Row[]; }
const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const SECTION_SIZE = 40;
const BATCH_SECTIONS = 5;
const cut = (value: unknown, limit: number) => { const text = typeof value === "string" ? value : ""; return text.length > limit ? `${text.slice(0, limit)}…` : text; };
const toRow = (contact: Contact): Row => {
  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  return { id: contact.id, name: cut(contact.name, 30), initial: contact.name ? contact.name.charAt(0) : "?", organization: cut(contact.organization, 40),
    position: cut(contact.position, 30), city: cut(contact.city, 20), tags: tags.slice(0, 2).map(tag => cut(tag, 12)), moreTags: Math.max(0, tags.length - 2) };
};
// Letter groups split into fixed-size sections so the list can be rendered a few sections at a time.
const directorySections = (contacts: Contact[]): Section[] => {
  const groups = new Map<string, Row[]>();
  contacts.forEach(contact => { const letter = LETTERS.includes(contact.initial) ? contact.initial : "#"; if (!groups.has(letter)) groups.set(letter, []); groups.get(letter)?.push(toRow(contact)); });
  const sections: Section[] = [];
  LETTERS.filter(letter => groups.has(letter)).forEach(letter => {
    const rows = groups.get(letter) || [];
    for (let start = 0; start < rows.length; start += SECTION_SIZE)
      sections.push({ key: `${letter}-${start}`, letter, first: start === 0, last: start + SECTION_SIZE >= rows.length, contacts: rows.slice(start, start + SECTION_SIZE) });
  });
  return sections;
};

Page({
  requestId: 0,
  tagRequestId: 0,
  active: true,
  unloaded: false,
  viewOwnerId: "",
  searchVersion: 0,
  searchTimer: null as ReturnType<typeof setTimeout> | null,
  cancelSearch() {
    this.searchVersion++;
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = null;
  },
  clearDirectory() {
    this.contactList = []; this.allSections = []; this.renderedSections = 0;
    this.setData({ total: 0, sections: [], letters: LETTERS.map(letter => ({ letter, available: false })), scrollIntoView: "", activeLetter: "" });
  },
  changeOwner(owner: string) {
    this.cancelSearch(); this.requestId++; this.tagRequestId++;
    this.viewOwnerId = owner; this.clearDirectory();
    this.setData({ keyword: "", city: "", country: "", province: "", regionFilter: false, filterLabel: "", selectedTag: "", tags: filterTags([]), creatingTag: false, loading: false, searchPending: false, loadError: "" });
  },
  // Full result of the last load (page instance only, never sent to the view).
  contactList: [] as Contact[],
  allSections: [] as Section[],
  renderedSections: 0,
  manageCategories() {
    wx.setStorageSync("graph-category-entry", {
      ownerId: wx.getStorageSync("ai-network-owner-id"), expiresAt: Date.now() + 30000,
    });
    wx.switchTab({ url: "/pages/graph/index", fail: () => {
      wx.removeStorageSync("graph-category-entry");
      showError(new Error("分类管理打开失败，请重试"));
    } });
  },
  data: { loading: false, searchPending: false, loadError: "", keyword: "", city: "", country: "", province: "", regionFilter: false, filterLabel: "", selectedTag: "", total: 0, sections: [] as Section[], tags: filterTags([]) as Tag[], creatingTag: false, letters: LETTERS.map(letter => ({ letter, available: false })), scrollIntoView: "", activeLetter: "", activeQuery: "" },
  onShow() {
    this.active = true;
    const owner = wx.getStorageSync("ai-network-owner-id") || "";
    if (this.viewOwnerId && this.viewOwnerId !== owner) this.changeOwner(owner);
    else this.viewOwnerId = owner;
    const region = wx.getStorageSync("contact-filter-region") as { country?: string; province?: string; city?: string } | "";
    const city = wx.getStorageSync("contact-filter-city") as string;
    wx.removeStorageSync("contact-filter-region");
    wx.removeStorageSync("contact-filter-city");
    if (region) this.setData({ ...region, regionFilter: true, filterLabel: [region.country || "未设置国家", region.province || "未设置省份", region.city || "未设置城市"].join(" / ") });
    else if (city) this.setData({ country: "", province: "", city, regionFilter: false, filterLabel: `城市：${city}` });
    this.loadTags(); return this.loadContacts();
  },
  onHide() {
    this.active = false; this.cancelSearch(); this.requestId++; this.tagRequestId++;
    this.setData({ searchPending: false, loading: false });
  },
  onUnload() { this.onHide(); this.unloaded = true; },
  async loadTags() {
    const id = ++this.tagRequestId, owner = wx.getStorageSync("ai-network-owner-id") || "";
    try {
      const tags = filterTags(await request<Tag[]>("/tags"));
      if (id === this.tagRequestId && this.active && !this.unloaded && owner === wx.getStorageSync("ai-network-owner-id")) this.setData({ tags });
    } catch (error) { if (id === this.tagRequestId && this.active && !this.unloaded && owner === wx.getStorageSync("ai-network-owner-id")) showError(error); }
  },
  async loadContacts() {
    if (!this.active || this.unloaded) return;
    this.cancelSearch();
    const owner = wx.getStorageSync("ai-network-owner-id") || "";
    if (this.viewOwnerId && this.viewOwnerId !== owner) this.changeOwner(owner);
    else this.viewOwnerId = owner;
    const current = ++this.requestId;
    this.setData({ loading: true, searchPending: false, loadError: "" });
    try {
      const params = [`keyword=${encodeURIComponent(this.data.keyword)}`];
      if (this.data.regionFilter) params.push(`country=${encodeURIComponent(this.data.country)}`, `province=${encodeURIComponent(this.data.province)}`, `city=${encodeURIComponent(this.data.city)}`);
      else if (this.data.city) params.push(`city=${encodeURIComponent(this.data.city)}`);
      if (this.data.selectedTag) params.push(`tag=${encodeURIComponent(this.data.selectedTag)}`);
      const query = params.join("&"); this.data.activeQuery = query;
      const contacts = await request<Contact[]>(`/contacts/directory?${query}`);
      if (current !== this.requestId || !this.active || this.unloaded) return;
      if (owner !== wx.getStorageSync("ai-network-owner-id")) throw new Error("账号已切换，请重新加载联系人");
      this.contactList = contacts;
      this.allSections = directorySections(contacts);
      this.renderedSections = Math.min(BATCH_SECTIONS, this.allSections.length);
      const available = new Set(this.allSections.map((section: Section) => section.letter));
      this.setData({ total: contacts.length, sections: this.allSections.slice(0, this.renderedSections), letters: LETTERS.map(letter => ({ letter, available: available.has(letter) })), scrollIntoView: "" });
    } catch (error) {
      if (current === this.requestId && this.active && !this.unloaded) {
        this.clearDirectory();
        this.setData({ loadError: owner !== wx.getStorageSync("ai-network-owner-id") ? "账号已切换，请重新加载联系人" : "联系人加载失败，请重新加载" });
        showError(error);
      }
    } finally {
      if (current === this.requestId && this.active && !this.unloaded) this.setData({ loading: false });
    }
  },
  // Appends the next sections by path, so earlier rows are not sent to the view again.
  renderMore(untilIndex = -1) {
    if (this.data.searchPending || this.data.loading || !this.active || this.unloaded) return;
    while (this.renderedSections < this.allSections.length) {
      const end = Math.min(this.allSections.length, this.renderedSections + BATCH_SECTIONS);
      const updates: Record<string, Section> = {};
      for (let index = this.renderedSections; index < end; index++) updates[`sections[${index}]`] = this.allSections[index];
      this.renderedSections = end;
      this.setData(updates);
      if (untilIndex < end) break;
    }
  },
  onListBottom() { this.renderMore(); },
  onKeyword(event: any) {
    if (!this.active || this.unloaded) return;
    const value = String(event.detail?.value || ""), owner = wx.getStorageSync("ai-network-owner-id") || "";
    if (this.viewOwnerId && this.viewOwnerId !== owner) this.changeOwner(owner);
    else this.viewOwnerId = owner;
    this.cancelSearch(); this.requestId++;
    this.setData({ keyword: value, searchPending: true, loading: false, loadError: "" });
    if (!value.trim()) return this.loadContacts();
    const version = this.searchVersion;
    this.searchTimer = setTimeout(() => {
      if (version !== this.searchVersion || !this.active || this.unloaded) return;
      this.searchTimer = null;
      if (owner !== wx.getStorageSync("ai-network-owner-id")) {
        this.changeOwner(wx.getStorageSync("ai-network-owner-id") || "");
        this.setData({ loadError: "账号已切换，请重新加载联系人" }); return;
      }
      this.loadContacts();
    }, 250);
  },
  search() { return this.loadContacts(); },
  clearFilters() {
    this.setData({ keyword: "", country: "", province: "", city: "", regionFilter: false, filterLabel: "", selectedTag: "" });
    return this.loadContacts();
  },
  selectTag(event: any) { const tag = event.currentTarget.dataset.tag; this.setData({ selectedTag: tag }); this.loadContacts(); },
  createTag() {
    if (this.data.creatingTag || !this.active || this.unloaded) return;
    const owner = wx.getStorageSync("ai-network-owner-id") || "";
    if (!owner || (this.viewOwnerId && this.viewOwnerId !== owner)) {
      this.changeOwner(owner); this.setData({ loadError: "账号已切换，请重新加载联系人" }); return;
    }
    wx.showModal({ title: "新增自定义标签", editable: true, placeholderText: "请输入你想要的标签内容", confirmText: "添加", success: async (result: any) => {
      if (!result.confirm || !this.active || this.unloaded) return;
      if (owner !== wx.getStorageSync("ai-network-owner-id")) {
        this.changeOwner(wx.getStorageSync("ai-network-owner-id") || "");
        this.setData({ loadError: "账号已切换，原标签操作已取消，请重新加载联系人" });
        return showError(new Error("账号已切换，原标签操作已取消"));
      }
      const name = String(result.content || "").trim();
      if (!name) return showError(new Error("请输入标签名称"));
      this.setData({ creatingTag: true });
      try {
        await request("/tags", "POST", { name });
        if (!this.active || this.unloaded) return;
        if (owner !== wx.getStorageSync("ai-network-owner-id")) {
          this.changeOwner(wx.getStorageSync("ai-network-owner-id") || "");
          this.setData({ loadError: "标签操作属于原账号，请重新加载联系人" }); return;
        }
        await this.loadTags(); wx.showToast({ title: "标签已添加", icon: "success" });
      }
      catch (error) { if (this.active && !this.unloaded) showError(error); }
      finally { if (!this.unloaded) this.setData({ creatingTag: false }); }
    } });
  },
  clearCity() { this.setData({ country: "", province: "", city: "", regionFilter: false, filterLabel: "" }); this.loadContacts(); },
  jumpLetter(event: any) {
    if (this.data.searchPending || this.data.loading || !this.active || this.unloaded) return;
    const letter = event.currentTarget.dataset.letter;
    if (!this.data.letters.find(item => item.letter === letter && item.available)) return;
    const index = this.allSections.findIndex((section: Section) => section.letter === letter && section.first);
    if (index >= this.renderedSections) this.renderMore(index);
    this.setData({ scrollIntoView: "", activeLetter: letter });
    setTimeout(() => this.setData({ scrollIntoView: `letter-${letter}` }), 0);
  },
  add() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
  detail(event: any) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
