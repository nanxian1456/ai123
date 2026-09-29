const { request, showError } = require("../../utils/api");
const { filterTags } = require("../../utils/contact-tags");

const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

function directoryGroups(contacts) {
  const groups = new Map();
  contacts.forEach((contact) => {
    const letter = LETTERS.includes(contact.initial) ? contact.initial : "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push({ ...contact, initial: contact.name ? contact.name.charAt(0) : "?" });
  });
  return LETTERS.filter((letter) => groups.has(letter)).map((letter) => ({ letter, contacts: groups.get(letter) }));
}

Page({
  data: { keyword: "", city: "", selectedTag: "", contacts: [], groups: [], tags: filterTags([]), creatingTag: false, letters: LETTERS.map((letter) => ({ letter, available: false })), scrollIntoView: "" },
  onShow() {
    const city = wx.getStorageSync("contact-filter-city") || this.data.city;
    wx.removeStorageSync("contact-filter-city");
    this.setData({ city }); this.loadTags(); this.loadContacts();
  },
  loadTags() { request("/tags").then((tags) => this.setData({ tags: filterTags(tags) })).catch(showError); },
  loadContacts() {
    const params = [`keyword=${encodeURIComponent(this.data.keyword)}`];
    if (this.data.city) params.push(`city=${encodeURIComponent(this.data.city)}`);
    if (this.data.selectedTag) params.push(`tag=${encodeURIComponent(this.data.selectedTag)}`);
    const query = params.join("&");
    this.activeQuery = query;
    request(`/contacts/directory?${query}`).then((contacts) => {
      if (this.activeQuery !== query) return;
      const groups = directoryGroups(contacts);
      const available = new Set(groups.map((group) => group.letter));
      this.setData({ contacts, groups, letters: LETTERS.map((letter) => ({ letter, available: available.has(letter) })), scrollIntoView: "" });
    }).catch(showError);
  },
  onKeyword(event) { this.setData({ keyword: event.detail.value }); },
  search() { this.loadContacts(); },
  selectTag(event) { const tag = event.currentTarget.dataset.tag; this.setData({ selectedTag: tag }); this.loadContacts(); },
  createTag() {
    if (this.data.creatingTag) return;
    wx.showModal({ title: "新增自定义标签", editable: true, placeholderText: "请输入你想要的标签内容", confirmText: "添加", success: (result) => {
      if (!result.confirm) return;
      const name = String(result.content || "").trim();
      if (!name) return showError(new Error("请输入标签名称"));
      this.setData({ creatingTag: true });
      request("/tags", "POST", { name }).then(() => {
        this.loadTags();
        wx.showToast({ title: "标签已添加", icon: "success" });
      }).catch(showError).finally(() => this.setData({ creatingTag: false }));
    } });
  },
  clearCity() { this.setData({ city: "" }); this.loadContacts(); },
  jumpLetter(event) {
    const letter = event.currentTarget.dataset.letter;
    if (!this.data.letters.find((item) => item.letter === letter && item.available)) return;
    this.setData({ scrollIntoView: "", activeLetter: letter });
    setTimeout(() => this.setData({ scrollIntoView: `letter-${letter}` }), 0);
  },
  add() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
  detail(event) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
