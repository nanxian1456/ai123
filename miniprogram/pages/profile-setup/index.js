const { request, showError } = require("../../utils/api");

Page({
  data: {
    isEdit: false,
    saving: false,
    avatars: [
      { type: "male-1", label: "男生 1" }, { type: "male-2", label: "男生 2" },
      { type: "female-1", label: "女生 1" }, { type: "female-2", label: "女生 2" }
    ],
    form: { nickname: "", organization: "", position: "", city: "", bio: "", avatarType: "male-1" }
  },
  onLoad(query) { const isEdit = query.mode === "edit"; this.setData({ isEdit }); if (isEdit) this.load(); },
  load() { request("/me").then((profile) => this.setData({ form: { nickname: profile.nickname || "", organization: profile.organization || "", position: profile.position || "", city: profile.city || "", bio: profile.bio || "", avatarType: profile.avatarType || "male-1" } })).catch(showError); },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  selectAvatar(event) { this.setData({ "form.avatarType": event.currentTarget.dataset.type }); },
  save() { if (this.data.saving) return; if (!this.data.form.nickname.trim()) { wx.showToast({ title: "请填写昵称", icon: "none" }); return; } this.setData({ saving: true }); request("/me", "PATCH", this.data.form).then(() => { wx.showToast({ title: "资料已保存", icon: "success" }); setTimeout(() => this.data.isEdit ? wx.navigateBack() : wx.switchTab({ url: "/pages/index/index" }), 400); }).catch(showError).finally(() => this.setData({ saving: false })); }
});
