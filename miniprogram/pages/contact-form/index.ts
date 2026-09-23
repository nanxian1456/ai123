import { request, showError } from "../../utils/api";

const AI_FIELDS = [
  { key: "name", label: "姓名" }, { key: "organization", label: "单位" },
  { key: "position", label: "职务" }, { key: "province", label: "省份" },
  { key: "city", label: "城市" }, { key: "phone", label: "电话" },
  { key: "email", label: "邮箱" }, { key: "tags", label: "标签" },
  { key: "note", label: "备注" }
];
const CONTACT_FIELDS = AI_FIELDS.filter(item => item.key !== "tags").map(item => item.key);
const splitTags = (value: string) => value.split(/[，,]/).map(item => item.trim()).filter(Boolean);
const previewFields = (data: any) => AI_FIELDS.map(({ key, label }) => {
  const raw = data[key];
  const value = Array.isArray(raw) ? raw.join("，") : typeof raw === "string" ? raw.trim() : "";
  return { key, label, value };
}).filter(item => item.value);

Page({
  data: { id: "", form: { name: "", organization: "", position: "", city: "", province: "", phone: "", email: "", note: "", tagsText: "" }, aiText: "", aiDraft: null as any, aiFields: [] as Array<{ key: string; label: string; value: string }>, extracting: false, importCode: "", importing: false, saving: false },
  onLoad(query: Record<string, string>) { if (query.id) this.loadContact(query.id); },
  async loadContact(id: string) {
    try {
      const contact = await request<any>(`/contacts/${id}`);
      this.setData({ id, form: { name: contact.name || "", organization: contact.organization || "", position: contact.position || "", city: contact.city || "", province: contact.province || "", phone: contact.phone || "", email: contact.email || "", note: contact.note || "", tagsText: (contact.tags || []).join("，") } });
      wx.setNavigationBarTitle({ title: "编辑联系人" });
    } catch (error) { showError(error); }
  },
  input(event: any) { const field = event.currentTarget.dataset.field; this.setData({ [`form.${field}`]: event.detail.value }); },
  aiInput(event: any) { this.setData({ aiText: event.detail.value, aiDraft: null, aiFields: [] }); },
  pasteFromClipboard() {
    wx.getClipboardData({
      success: ({ data }) => {
        const text = String(data || "");
        if (!text.trim()) return wx.showToast({ title: "剪贴板没有文字", icon: "none" });
        this.setData({ aiText: text.slice(0, 4000), aiDraft: null, aiFields: [] });
        wx.showToast({ title: text.length > 4000 ? "已粘贴前4000字" : "已粘贴", icon: "none" });
      },
      fail: () => wx.showToast({ title: "读取剪贴板失败", icon: "none" })
    });
  },
  clearAiText() { this.setData({ aiText: "", aiDraft: null, aiFields: [] }); },
  importCodeInput(event: any) { this.setData({ importCode: event.detail.value.toUpperCase() }); },
  async importUser() {
    const code = this.data.importCode.trim();
    if (!code) return wx.showToast({ title: "请输入对方导入码", icon: "none" });
    this.setData({ importing: true });
    try {
      const profile = await request<any>(`/users/importable/${encodeURIComponent(code)}`);
      this.setData({ "form.name": profile.nickname, "form.organization": profile.organization || "", "form.position": profile.position || "", "form.city": profile.city || "", "form.note": profile.bio || "" });
      wx.showToast({ title: "已导入对方公开资料", icon: "success" });
    } catch (error) { showError(error); } finally { this.setData({ importing: false }); }
  },
  async extract() {
    if (this.data.extracting) return;
    const text = this.data.aiText.trim();
    if (!text) return wx.showToast({ title: "请先粘贴人物介绍", icon: "none" });
    this.setData({ extracting: true, aiDraft: null, aiFields: [] });
    try {
      const result = await request<{ data: Record<string, string | string[]> }>("/ai/extract", "POST", { text });
      if (this.data.aiText.trim() !== text) return;
      const data = result.data || {};
      const aiFields = previewFields(data);
      if (!aiFields.length) return wx.showToast({ title: "未识别到联系人信息", icon: "none" });
      this.setData({ aiDraft: data, aiFields });
    } catch (error) { showError(error); } finally { this.setData({ extracting: false }); }
  },
  applyAiDraft() {
    const data = this.data.aiDraft;
    if (!data) return;
    const updates: Record<string, string> = {};
    CONTACT_FIELDS.forEach(field => {
      const value = data[field];
      if (typeof value === "string" && value.trim() && !String(this.data.form[field] || "").trim()) {
        updates[`form.${field}`] = value.trim();
      }
    });
    const existingTags = splitTags(this.data.form.tagsText || "");
    const extractedTags = Array.isArray(data.tags) ? data.tags.map((tag: string) => tag.trim()).filter(Boolean) : [];
    const tags = Array.from(new Set([...existingTags, ...extractedTags])).slice(0, 10);
    if (tags.length > existingTags.length) updates["form.tagsText"] = tags.join("，");
    if (!Object.keys(updates).length) return wx.showToast({ title: "已有资料未被覆盖", icon: "none" });
    this.setData(updates);
    wx.pageScrollTo({ selector: "#contact-form", duration: 250 });
    wx.showToast({ title: "已填入空白字段", icon: "success" });
  },
  async save() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!form.name.trim()) return wx.showToast({ title: "请填写姓名", icon: "none" });
    const tags = Array.from(new Set(splitTags(form.tagsText)));
    if (tags.length > 10 || tags.some(tag => tag.length > 20)) return wx.showToast({ title: "标签最多10个，每个不超过20字", icon: "none" });
    const payload = { ...form, name: form.name.trim(), tags };
    delete (payload as { tagsText?: string }).tagsText;
    this.setData({ saving: true });
    try { await request(this.data.id ? `/contacts/${this.data.id}` : "/contacts", this.data.id ? "PATCH" : "POST", payload); wx.showToast({ title: "已保存", icon: "success" }); setTimeout(() => wx.navigateBack(), 500); }
    catch (error) { this.setData({ saving: false }); showError(error); }
  }
});
