const { getCurrentOwnerId, showError } = require("../../utils/api");
const local = require("../../utils/local-data");
const backup = require("../../utils/backup");

Page({
  data: { exportPassword: "", importPassword: "", selectedName: "", selectedPath: "", preview: null, pending: null, busy: false },
  exportPasswordInput(event) { this.setData({ exportPassword: event.detail.value }); },
  importPasswordInput(event) { this.setData({ importPassword: event.detail.value, preview: null, pending: null }); },
  async exportData() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      const ownerId = await getCurrentOwnerId();
      const content = await backup.create(ownerId, this.data.exportPassword);
      const path = `${wx.env.USER_DATA_PATH}/aimap-backup.aimap`;
      await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath: path, data: content, encoding: "utf8", success: resolve, fail: () => reject(new Error("备份文件写入失败，请检查存储空间")) }));
      this.setData({ exportPassword: "" });
      if (!wx.shareFileMessage) throw new Error("当前微信版本不支持分享文件，请更新微信");
      await new Promise((resolve, reject) => wx.shareFileMessage({ filePath: path, fileName: "aimap-backup.aimap", success: resolve, fail: () => reject(new Error("文件已加密生成，但分享未完成，请重试")) }));
    } catch (error) { showError(error); } finally { this.setData({ busy: false }); }
  },
  chooseFile() {
    wx.chooseMessageFile({ count: 1, type: "file", extension: ["aimap"], success: result => {
      const file = result.tempFiles[0];
      if (!file || file.size > 12 * 1024 * 1024) return showError(new Error("备份文件不能超过12MB"));
      this.setData({ selectedName: file.name, selectedPath: file.path, preview: null, pending: null });
    }, fail: () => showError(new Error("未选择备份文件")) });
  },
  async inspect() {
    if (this.data.busy || !this.data.selectedPath) return;
    this.setData({ busy: true, preview: null, pending: null });
    try {
      const ownerId = await getCurrentOwnerId();
      const content = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: this.data.selectedPath, encoding: "utf8", success: result => resolve(result.data), fail: () => reject(new Error("备份文件无法读取")) }));
      const pending = backup.open(content, this.data.importPassword, ownerId);
      this.setData({ preview: backup.preview(local.read(ownerId), pending), pending, importPassword: "" });
    } catch (error) { showError(error); } finally { this.setData({ busy: false }); }
  },
  restoreData() {
    if (!this.data.pending || this.data.busy) return;
    wx.showModal({ title: "替换本机数据", content: "将用备份中的资料、联系人和关系覆盖当前手机数据。当前手机独有的改动将丢失，建议先导出备份。", confirmText: "确认替换", success: async result => {
      if (!result.confirm) return;
      this.setData({ busy: true });
      try {
        const ownerId = await getCurrentOwnerId();
        await backup.restore(ownerId, this.data.pending);
        this.setData({ selectedName: "", selectedPath: "", preview: null, pending: null });
        wx.showToast({ title: "恢复成功", icon: "success" });
      } catch (error) { showError(error); } finally { this.setData({ busy: false }); }
    } });
  }
});
