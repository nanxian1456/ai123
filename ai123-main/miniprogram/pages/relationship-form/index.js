const { request, showError } = require("../../utils/api");

Page({
  data: { sourceId: 0, contacts: [], source: null, targetIndex: 0, targetName: "暂无可选联系人", types: ["合作", "指导", "导师", "同事", "同学", "客户", "朋友"], typeIndex: 0, typeName: "合作", note: "" },
  onLoad(query) {
    if (!query.sourceId) { wx.navigateBack(); return; }
    request("/contacts").then((contacts) => { const sourceId = Number(query.sourceId); const candidates = contacts.filter((contact) => contact.id !== sourceId); this.setData({ sourceId, contacts: candidates, source: contacts.find((contact) => contact.id === sourceId) || null, targetName: candidates[0] ? candidates[0].name : "暂无可选联系人" }); }).catch(showError);
  },
  targetChange(event) { const targetIndex = Number(event.detail.value); this.setData({ targetIndex, targetName: this.data.contacts[targetIndex].name }); },
  typeChange(event) { const typeIndex = Number(event.detail.value); this.setData({ typeIndex, typeName: this.data.types[typeIndex] }); },
  noteInput(event) { this.setData({ note: event.detail.value }); },
  save() { const target = this.data.contacts[this.data.targetIndex]; if (!target) { wx.showToast({ title: "请先新增另一位联系人", icon: "none" }); return; } request("/relationships", "POST", { sourceId: this.data.sourceId, targetId: target.id, type: this.data.types[this.data.typeIndex], note: this.data.note }).then(() => { wx.showToast({ title: "关系已建立", icon: "success" }); setTimeout(() => wx.navigateBack(), 400); }).catch(showError); }
});
