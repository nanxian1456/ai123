import { request, showError } from "../../utils/api";

Page({
  data: { id: "", form: { name: "", organization: "", position: "", city: "", province: "", phone: "", email: "", note: "", tagsText: "" }, aiText: "", extracting: false, importCode: "", importing: false },
  onLoad(query: Record<string, string>) { if (query.id) this.loadContact(query.id); },
  async loadContact(id: string) {
    try {
      const contact = await request<any>(`/contacts/${id}`);
      this.setData({ id, form: { name: contact.name || "", organization: contact.organization || "", position: contact.position || "", city: contact.city || "", province: contact.province || "", phone: contact.phone || "", email: contact.email || "", note: contact.note || "", tagsText: (contact.tags || []).join("，") } });
      wx.setNavigationBarTitle({ title: "编辑联系人" });
    } catch (error) { showError(error); }
  },
  input(event: any) { const field = event.currentTarget.dataset.field; this.setData({ [`form.${field}`]: event.detail.value }); },
  aiInput(event: any) { this.setData({ aiText: event.detail.value }); },
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
    if (!this.data.aiText.trim()) return wx.showToast({ title: "请先粘贴人物介绍", icon: "none" });
    this.setData({ extracting: true });
    try {
      const result = await request<{ data: Record<string, string | string[]> }>("/ai/extract", "POST", { text: this.data.aiText });
      const data = result.data;
      this.setData({ "form.organization": data.organization || "", "form.position": data.position || "", "form.city": data.city || "", "form.tagsText": Array.isArray(data.tags) ? data.tags.join("，") : "" });
      wx.showToast({ title: "已填入可识别字段", icon: "success" });
    } catch (error) { showError(error); } finally { this.setData({ extracting: false }); }
  },
  async save() {
    const form = this.data.form;
    if (!form.name.trim()) return wx.showToast({ title: "请填写姓名", icon: "none" });
    const payload = { ...form, tags: form.tagsText.split(/[，,]/).map(item => item.trim()).filter(Boolean) };
    delete (payload as { tagsText?: string }).tagsText;
    try { await request(this.data.id ? `/contacts/${this.data.id}` : "/contacts", this.data.id ? "PATCH" : "POST", payload); wx.showToast({ title: "已保存", icon: "success" }); setTimeout(() => wx.navigateBack(), 500); }
    catch (error) { showError(error); }
  }
});
