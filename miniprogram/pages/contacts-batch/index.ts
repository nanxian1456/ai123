import { request, showError } from "../../utils/api";
import bulk = require("../../utils/bulk-contacts");

Page({
  data: { source: "", entries: [] as any[], saving: false, selectedCount: 0 },
  input(event: any) { this.setData({ source: event.detail.value, entries: [], selectedCount: 0 }); },
  paste() { wx.getClipboardData({ success: result => this.setData({ source: String(result.data || "").slice(0, 12000), entries: [], selectedCount: 0 }), fail: () => showError(new Error("剪贴板读取失败")) }); },
  async inspect() {
    try {
      const existing = await request<any[]>("/contacts");
      const entries = bulk.parse(this.data.source, existing);
      this.setData({ entries, selectedCount: entries.filter((item: any) => item.selected).length });
    } catch (error) { showError(error); }
  },
  toggle(event: any) {
    const row = Number(event.currentTarget.dataset.row);
    const entries = this.data.entries.map(item => item.row === row ? { ...item, selected: !item.selected } : item);
    this.setData({ entries, selectedCount: entries.filter(item => item.selected).length });
  },
  async save() {
    if (this.data.saving || !this.data.selectedCount) return;
    this.setData({ saving: true });
    try {
      const selected = this.data.entries.filter(item => item.selected).map(({ name, organization, position, city, phone, province, email, note, tags }) => ({ name, organization, position, city, phone, province, email, note, tags }));
      await request("/contacts/batch", "POST", selected);
      wx.showToast({ title: `已保存${selected.length}位`, icon: "success" });
      setTimeout(() => wx.switchTab({ url: "/pages/contacts/index" }), 500);
    } catch (error) { showError(error); } finally { this.setData({ saving: false }); }
  }
});
