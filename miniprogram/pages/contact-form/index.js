const { request, showError } = require("../../utils/api");

const AI_FIELDS = [
  { key: "name", label: "姓名" }, { key: "organization", label: "单位" },
  { key: "position", label: "职务" }, { key: "province", label: "省份" },
  { key: "city", label: "城市" }, { key: "phone", label: "电话" },
  { key: "email", label: "邮箱" }, { key: "tags", label: "标签" },
  { key: "note", label: "备注" }
];
const CONTACT_FIELDS = AI_FIELDS.filter((item) => item.key !== "tags").map((item) => item.key);
const splitTags = (value) => value.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
const previewFields = (data) => AI_FIELDS.map(({ key, label }) => {
  const raw = data[key];
  const value = Array.isArray(raw) ? raw.join("，") : typeof raw === "string" ? raw.trim() : "";
  return { key, label, value };
}).filter((item) => item.value);

Page({
  data: {
    id: "",
    form: { name: "", organization: "", position: "", city: "", province: "", phone: "", email: "", note: "", tagsText: "" },
    aiText: "", aiDraft: null, aiFields: [], extracting: false, importCode: "", importing: false, saving: false
  },
  onLoad(query) { if (query.id) this.loadContact(query.id); },
  loadContact(id) {
    request(`/contacts/${id}`).then((contact) => {
      this.setData({ id, form: { name: contact.name || "", organization: contact.organization || "", position: contact.position || "", city: contact.city || "", province: contact.province || "", phone: contact.phone || "", email: contact.email || "", note: contact.note || "", tagsText: (contact.tags || []).join("，") } });
      wx.setNavigationBarTitle({ title: "编辑联系人" });
    }).catch(showError);
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  aiInput(event) { this.setData({ aiText: event.detail.value, aiDraft: null, aiFields: [] }); },
  pasteFromClipboard() {
    wx.getClipboardData({
      success: ({ data }) => {
        const text = String(data || "");
        if (!text.trim()) { wx.showToast({ title: "剪贴板没有文字", icon: "none" }); return; }
        this.setData({ aiText: text.slice(0, 4000), aiDraft: null, aiFields: [] });
        wx.showToast({ title: text.length > 4000 ? "已粘贴前4000字" : "已粘贴", icon: "none" });
      },
      fail: () => wx.showToast({ title: "读取剪贴板失败", icon: "none" })
    });
  },
  clearAiText() { this.setData({ aiText: "", aiDraft: null, aiFields: [] }); },
  importCodeInput(event) { this.setData({ importCode: event.detail.value.toUpperCase() }); },
  importUser() {
    const code = this.data.importCode.trim();
    if (!code) { wx.showToast({ title: "请输入对方导入码", icon: "none" }); return; }
    this.setData({ importing: true });
    request(`/users/importable/${encodeURIComponent(code)}`).then((profile) => {
      this.setData({ "form.name": profile.nickname, "form.organization": profile.organization || "", "form.position": profile.position || "", "form.city": profile.city || "", "form.note": profile.bio || "" });
      wx.showToast({ title: "已导入对方公开资料", icon: "success" });
    }).catch(showError).finally(() => this.setData({ importing: false }));
  },
  extract() {
    if (this.data.extracting) return;
    const text = this.data.aiText.trim();
    if (!text) { wx.showToast({ title: "请先粘贴人物介绍", icon: "none" }); return; }
    this.setData({ extracting: true, aiDraft: null, aiFields: [] });
    request("/ai/extract", "POST", { text }).then((result) => {
      if (this.data.aiText.trim() !== text) return;
      const data = result.data || {};
      const aiFields = previewFields(data);
      if (!aiFields.length) { wx.showToast({ title: "未识别到联系人信息", icon: "none" }); return; }
      this.setData({ aiDraft: data, aiFields });
    }).catch(showError).finally(() => this.setData({ extracting: false }));
  },
  applyAiDraft() {
    const data = this.data.aiDraft;
    if (!data) return;
    const updates = {};
    CONTACT_FIELDS.forEach((field) => {
      const value = data[field];
      if (typeof value === "string" && value.trim() && !String(this.data.form[field] || "").trim()) {
        updates[`form.${field}`] = value.trim();
      }
    });
    const existingTags = splitTags(this.data.form.tagsText || "");
    const extractedTags = Array.isArray(data.tags) ? data.tags.map((tag) => tag.trim()).filter(Boolean) : [];
    const tags = Array.from(new Set([...existingTags, ...extractedTags])).slice(0, 10);
    if (tags.length > existingTags.length) updates["form.tagsText"] = tags.join("，");
    if (!Object.keys(updates).length) { wx.showToast({ title: "已有资料未被覆盖", icon: "none" }); return; }
    this.setData(updates);
    wx.pageScrollTo({ selector: "#contact-form", duration: 250 });
    wx.showToast({ title: "已填入空白字段", icon: "success" });
  },
  save() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!form.name.trim()) { wx.showToast({ title: "请填写姓名", icon: "none" }); return; }
    const tags = Array.from(new Set(splitTags(form.tagsText)));
    if (tags.length > 10 || tags.some((tag) => tag.length > 20)) { wx.showToast({ title: "标签最多10个，每个不超过20字", icon: "none" }); return; }
    const payload = { ...form, name: form.name.trim(), tags };
    delete payload.tagsText;
    this.setData({ saving: true });
    request(this.data.id ? `/contacts/${this.data.id}` : "/contacts", this.data.id ? "PATCH" : "POST", payload).then(() => {
      wx.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 500);
    }).catch((error) => { this.setData({ saving: false }); showError(error); });
  }
});
