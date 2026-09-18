const { request, showError } = require("../../utils/api");

Page({
  data: {
    id: "",
    form: { name: "", organization: "", position: "", city: "", province: "", phone: "", email: "", note: "", tagsText: "" },
    aiText: "", extracting: false
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
