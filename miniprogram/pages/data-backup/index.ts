import {
  getCurrentOwnerId,
  syncPublishedProfile,
  showError,
} from "../../utils/api";
import local = require("../../utils/local-data");
import backup = require("../../utils/backup");
import { accountSummary, backupHistory, backupFilePath, rememberBackup, timeLabel, avatarUsage, type BackupRecord } from "../../utils/account-state";

Page({
  data: {
    exportPassword: "",
    exportPasswordConfirm: "",
    showExportPassword: false,
    importPassword: "",
    selectedName: "",
    selectedPath: "",
    preview: null as any,
    busy: false,
    busyMessage: "",
    history: [] as Array<BackupRecord & { timeLabel: string }>,
    exportReady: false, exportName: "", storageLabel: "", storageWarning: false, contacts: 0, relationships: 0,
    lastBackup: "", backupWarning: "", backupUnsaved: false, infoError: "", recordWarning: "", restoreNeedsSync: false, avatarSizeLabel: "",
  },
  exportSequence: 0,
  exportFile: null as null | { ownerId: string; path: string; record: BackupRecord },
  onShow() { return this.refreshInfo(); },
  retryInfo() { return this.refreshInfo(); },
  async refreshInfo(ownerId?: string) {
    try {
      const owner = ownerId || await getCurrentOwnerId();
      this.restoreUnsharedExport(owner);
      this.setData({ ...accountSummary(owner), history: backupHistory(owner).map(row => ({ ...row, timeLabel: timeLabel(row.createdAt) })), infoError: "" });
      this.setData({ avatarSizeLabel: await avatarUsage(owner) });
    } catch (error) { this.setData({ infoError: error instanceof Error ? error.message : "容量信息暂不可用" }); }
  },
  // The decrypted backup (all contacts plus the avatar as base64, up to ~5MB) is kept on the
  // page instance. Putting it into setData would exceed WeChat's 1MB-per-call limit.
  pendingBackup: null as any,
  exportPasswordInput(event: any) {
    if (this.data.busy) return;
    this.setData({ exportPassword: event.detail.value });
  },
  exportPasswordConfirmInput(event: any) {
    if (this.data.busy) return;
    this.setData({ exportPasswordConfirm: event.detail.value });
  },
  toggleExportPassword() { this.setData({ showExportPassword: !this.data.showExportPassword }); },
  // After leaving and reopening the page, the latest unshared file can still be shared again.
  restoreUnsharedExport(ownerId: string) {
    if (this.exportFile && this.exportFile.ownerId === ownerId) return;
    this.exportFile = null;
    const latest = backupHistory(ownerId)[0];
    if (!latest || latest.shared) { this.setData({ exportReady: false, exportName: "" }); return; }
    const path = backupFilePath(ownerId);
    try { wx.getFileSystemManager().accessSync(path); } catch (_) { this.setData({ exportReady: false, exportName: "" }); return; }
    this.exportFile = { ownerId, path, record: { ...latest } };
    this.setData({ exportReady: true, exportName: latest.fileName });
  },
  importPasswordInput(event: any) {
    if (this.data.busy) return;
    this.pendingBackup = null;
    this.setData({
      importPassword: event.detail.value,
      preview: null,
    });
  },
  async exportData() {
    if (this.data.busy) return;
    // A mistyped hidden password would make the backup impossible to open.
    if (this.data.exportPassword !== this.data.exportPasswordConfirm) {
      showError(new Error("两次输入的备份密码不一致，请重新输入"));
      return;
    }
    this.setData({ busy: true, busyMessage: "正在加密并生成备份…" });
    try {
      const ownerId = await getCurrentOwnerId();
      const snapshot = local.read(ownerId);
      if (!snapshot) throw new Error("本机资料尚未初始化");
      const content = await backup.create(ownerId, this.data.exportPassword);
      const createdAt = Date.now();
      const fileName = `aimap-backup-${createdAt}-${++this.exportSequence}.aimap`;
      const path = backupFilePath(ownerId);
      await new Promise((resolve, reject) =>
        wx.getFileSystemManager().writeFile({
          filePath: path,
          data: content,
          encoding: "utf8",
          success: resolve,
          fail: () => reject(new Error("备份文件写入失败，请检查存储空间")),
        }),
      );
      const record: BackupRecord = { fileName, createdAt, contacts: snapshot.contacts.length, relationships: snapshot.relationships.length, bytes: content.length, shared: false };
      this.exportFile = { ownerId, path, record };
      this.setData({ exportPassword: "", exportPasswordConfirm: "", showExportPassword: false, exportReady: true, exportName: fileName,
        recordWarning: rememberBackup(ownerId, record) ? "" : "文件已生成，但本机备份记录未保存，请确认文件另存成功。" });
      await this.refreshInfo(ownerId);
      await this.shareExport();
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ busy: false, busyMessage: "" });
    }
  },
  async shareExport() {
    const file = this.exportFile;
    if (!file) return;
    if (await getCurrentOwnerId() !== file.ownerId) throw new Error("账号已切换，不能分享上一个账号的备份");
    if (!wx.shareFileMessage) throw new Error("文件已生成，当前微信不支持分享文件，请更新后重试");
    await new Promise((resolve, reject) => wx.shareFileMessage({ filePath: file.path, fileName: file.record.fileName,
      success: resolve, fail: () => reject(new Error("文件已生成，但分享未完成，可点击重新分享")) }));
    file.record.shared = true;
    if (!rememberBackup(file.ownerId, file.record)) this.setData({ recordWarning: "分享已完成，但本机备份记录未更新。" });
    await this.refreshInfo(file.ownerId);
  },
  async retryShare() {
    if (this.data.busy || !this.exportFile) return;
    this.setData({ busy: true, busyMessage: "正在分享已生成的备份…" });
    try { await this.shareExport(); } catch (error) { showError(error); }
    finally { this.setData({ busy: false, busyMessage: "" }); }
  },
  chooseFile() {
    if (this.data.busy) return;
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["aimap"],
      success: (result) => {
        const file = result.tempFiles[0];
        if (!file || file.size > 24 * 1024 * 1024)
          return showError(new Error("备份文件不能超过24MB"));
        this.pendingBackup = null;
        this.setData({
          selectedName: file.name,
          selectedPath: file.path,
          preview: null,
        });
      },
      fail: () => showError(new Error("未选择备份文件")),
    });
  },
  async inspect() {
    if (this.data.busy || !this.data.selectedPath) return;
    this.pendingBackup = null;
    this.setData({
      busy: true,
      busyMessage: "正在解密并核对备份…",
      preview: null,
    });
    try {
      const ownerId = await getCurrentOwnerId();
      const content = await new Promise<string>((resolve, reject) =>
        wx.getFileSystemManager().readFile({
          filePath: this.data.selectedPath,
          encoding: "utf8",
          success: (result) => resolve(result.data as string),
          fail: () => reject(new Error("备份文件无法读取")),
        }),
      );
      const pending = await backup.openAsync(
        content,
        this.data.importPassword,
        ownerId,
      );
      const current = local.read(ownerId);
      if (!current) throw new Error("本机资料尚未初始化，请先完成注册并重试");
      this.pendingBackup = pending;
      this.setData({
        preview: backup.preview(current, pending),
        importPassword: "",
        restoreNeedsSync: !!(current.profile.visibility?.nickname || pending.data?.profile?.visibility?.nickname ||
          ["pending", "error"].includes(current.profile.publicationStatus)),
      });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ busy: false, busyMessage: "" });
    }
  },
  restoreData() {
    if (!this.pendingBackup || this.data.busy) return;
    this.setData({ busy: true, busyMessage: "等待确认恢复" });
    wx.showModal({
      title: "替换本机数据",
      content:
        "将用备份中的资料、联系人和关系覆盖当前手机数据。当前手机独有的改动将丢失，建议先导出备份。" +
        (this.data.restoreNeedsSync ? "本次还需联网同步公开资料；明确同步失败时将尝试回滚，结果不确定时保留数据并提示重试。" : ""),
      confirmText: "确认替换",
      success: async (result) => {
        if (!result.confirm) {
          this.setData({ busy: false, busyMessage: "" });
          return;
        }
        this.setData({ busy: true, busyMessage: "正在恢复并同步公开资料…" });
        try {
          const ownerId = await getCurrentOwnerId();
          const previous = local.read(ownerId);
          if (!previous)
            throw new Error("本机资料尚未初始化，请先完成注册并重试");
          const token = await backup.restore(ownerId, this.pendingBackup);
          try {
            const restored = local.read(ownerId);
            if (!restored)
              throw new Error("恢复后的资料无法读取，请重新登录检查");
            if (
              previous.profile.visibility.nickname ||
              restored.profile.visibility.nickname ||
              ["pending", "error"].includes(previous.profile.publicationStatus)
            )
              await syncPublishedProfile(restored.profile);
          } catch (error) {
            if ((error as any).ambiguous) {
              this.pendingBackup = null;
              this.setData({
                selectedName: "",
                selectedPath: "",
                preview: null,
              });
              throw error;
            }
            if (!backup.rollbackRestore(ownerId, token)) {
              this.pendingBackup = null;
              this.setData({
                selectedName: "",
                selectedPath: "",
                preview: null,
              });
              throw new Error(
                "公开资料同步失败。为保护恢复后的新改动，已保留本机数据，请到隐私设置重试同步。",
              );
            }
            throw error;
          }
          this.pendingBackup = null;
          this.setData({
            selectedName: "",
            selectedPath: "",
            preview: null,
          });
          wx.showToast({ title: "恢复成功", icon: "success" });
          await this.refreshInfo(ownerId);
        } catch (error) {
          showError(error);
        } finally {
          this.setData({ busy: false, busyMessage: "" });
        }
      },
      fail: () => this.setData({ busy: false, busyMessage: "" }),
    });
  },
});
