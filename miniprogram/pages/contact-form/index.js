const { request, showError } = require("../../utils/api");

Page({
  data: {
    id: "",
    form: { name: "", organization: "", position: "", city: "", province: "", phone: "", email: "", note: "", tagsText: "" },
    aiText: "", extracting: false, importCode: "", importing: false
  },
  onLoad(query) { if (query.id) this.loadContact(query.id); },
  loadContact(id) {
    request(`/contacts/${id}`).then((contact) => {
      this.setData({ id, form: { name: contact.name || "", organization: contact.organization || "", position: contact.position || "", city: contact.city || "", province: contact.province || "", phone: contact.phone || "", email: contact.email || "", note: contact.note || "", tagsText: (contact.tags || []).join("，") } });
      wx.setNavigationBarTitle({ title: "编辑联系人" });
    }).catch(showError);
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  aiInput(event) { this.setData({ aiText: event.detail.value }); },
  pasteFromClipboard() {
    wx.getClipboardData({
      success: ({ data }) => {
        const text = String(data || "");
        if (!text.trim()) { wx.showToast({ title: "剪贴板没有文字", icon: "none" }); return; }
        this.setData({ aiText: text.slice(0, 4000) });
        wx.showToast({ title: text.length > 4000 ? "已粘贴前4000字" : "已粘贴", icon: "none" });
      },
      fail: () => wx.showToast({ title: "读取剪贴板失败", icon: "none" })
    });
  },
  clearAiText() { this.setData({ aiText: "" }); },
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
    if (!this.data.aiText.trim()) { wx.showToast({ title: "请先粘贴人物介绍", icon: "none" }); return; }
    this.setData({ extracting: true });
    request("/ai/extract", "POST", { text: this.data.aiText }).then((result) => {
      const data = result.data || {};
      this.setData({ "form.organization": data.organization || "", "form.position": data.position || "", "form.city": data.city || "", "form.tagsText": Array.isArray(data.tags) ? data.tags.join("，") : "" });
      wx.showToast({ title: "已填入可识别字段", icon: "success" });
    }).catch(showError).finally(() => this.setData({ extracting: false }));
  },
  save() {
    const form = this.data.form;
    if (!form.name.trim()) { wx.showToast({ title: "请填写姓名", icon: "none" }); return; }
    const payload = { ...form, tags: form.tagsText.split(/[，,]/).map((item) => item.trim()).filter(Boolean) };
    delete payload.tagsText;
    request(this.data.id ? `/contacts/${this.data.id}` : "/contacts", this.data.id ? "PATCH" : "POST", payload).then(() => {
      wx.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 500);
    }).catch(showError);
  }
});
