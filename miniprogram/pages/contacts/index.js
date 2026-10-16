"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const contact_tags_1 = require("../../utils/contact-tags");
const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const directoryGroups = (contacts) => {
    const groups = new Map();
    contacts.forEach(contact => { const letter = LETTERS.includes(contact.initial) ? contact.initial : "#"; if (!groups.has(letter))
        groups.set(letter, []); groups.get(letter)?.push({ ...contact, initial: contact.name ? contact.name.charAt(0) : "?" }); });
    return LETTERS.filter(letter => groups.has(letter)).map(letter => ({ letter, contacts: groups.get(letter) || [] }));
};
Page({
    data: { keyword: "", city: "", country: "", province: "", regionFilter: false, filterLabel: "", selectedTag: "", contacts: [], groups: [], tags: (0, contact_tags_1.filterTags)([]), creatingTag: false, letters: LETTERS.map(letter => ({ letter, available: false })), scrollIntoView: "", activeLetter: "", activeQuery: "" },
    onShow() {
        const region = wx.getStorageSync("contact-filter-region");
        const city = wx.getStorageSync("contact-filter-city");
        wx.removeStorageSync("contact-filter-region");
        wx.removeStorageSync("contact-filter-city");
        if (region)
            this.setData({ ...region, regionFilter: true, filterLabel: [region.country || "未设置国家", region.province || "未设置省份", region.city || "未设置城市"].join(" / ") });
        else if (city)
            this.setData({ city });
        this.loadTags();
        this.loadContacts();
    },
    async loadTags() { try {
        this.setData({ tags: (0, contact_tags_1.filterTags)(await (0, api_1.request)("/tags")) });
    }
    catch (error) {
        (0, api_1.showError)(error);
    } },
    async loadContacts() { try {
        const params = [`keyword=${encodeURIComponent(this.data.keyword)}`];
        if (this.data.regionFilter) {
            if (this.data.country)
                params.push(`country=${encodeURIComponent(this.data.country)}`);
            if (this.data.province)
                params.push(`province=${encodeURIComponent(this.data.province)}`);
            if (this.data.city)
                params.push(`city=${encodeURIComponent(this.data.city)}`);
        }
        else if (this.data.city)
            params.push(`city=${encodeURIComponent(this.data.city)}`);
        if (this.data.selectedTag)
            params.push(`tag=${encodeURIComponent(this.data.selectedTag)}`);
        const query = params.join("&");
        this.data.activeQuery = query;
        const contacts = await (0, api_1.request)(`/contacts/directory?${query}`);
        if (this.data.activeQuery !== query)
            return;
        const groups = directoryGroups(contacts);
        const available = new Set(groups.map(group => group.letter));
        this.setData({ contacts, groups, letters: LETTERS.map(letter => ({ letter, available: available.has(letter) })), scrollIntoView: "" });
    }
    catch (error) {
        (0, api_1.showError)(error);
    } },
    onKeyword(event) { this.setData({ keyword: event.detail.value }); },
    search() { this.loadContacts(); },
    selectTag(event) { const tag = event.currentTarget.dataset.tag; this.setData({ selectedTag: tag }); this.loadContacts(); },
    createTag() {
        if (this.data.creatingTag)
            return;
        wx.showModal({ title: "新增自定义标签", editable: true, placeholderText: "请输入你想要的标签内容", confirmText: "添加", success: async (result) => {
                if (!result.confirm)
                    return;
                const name = String(result.content || "").trim();
                if (!name)
                    return (0, api_1.showError)(new Error("请输入标签名称"));
                this.setData({ creatingTag: true });
                try {
                    await (0, api_1.request)("/tags", "POST", { name });
                    await this.loadTags();
                    wx.showToast({ title: "标签已添加", icon: "success" });
                }
                catch (error) {
                    (0, api_1.showError)(error);
                }
                finally {
                    this.setData({ creatingTag: false });
                }
            } });
    },
    clearCity() { this.setData({ country: "", province: "", city: "", regionFilter: false, filterLabel: "" }); this.loadContacts(); },
    jumpLetter(event) { const letter = event.currentTarget.dataset.letter; if (!this.data.letters.find(item => item.letter === letter && item.available))
        return; this.setData({ scrollIntoView: "", activeLetter: letter }); setTimeout(() => this.setData({ scrollIntoView: `letter-${letter}` }), 0); },
    add() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
    detail(event) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
