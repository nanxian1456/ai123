"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const local = require("../../utils/local-data");
const backup = require("../../utils/backup");
Page({
    data: {
        exportPassword: "",
        importPassword: "",
        selectedName: "",
        selectedPath: "",
        preview: null,
        pending: null,
        busy: false,
        busyMessage: "",
    },
    exportPasswordInput(event) {
        if (this.data.busy)
            return;
        this.setData({ exportPassword: event.detail.value });
    },
    importPasswordInput(event) {
        if (this.data.busy)
            return;
        this.setData({
            importPassword: event.detail.value,
            preview: null,
            pending: null,
        });
    },
    async exportData() {
        if (this.data.busy)
            return;
        this.setData({ busy: true, busyMessage: "正在加密并生成备份…" });
        try {
            const ownerId = await (0, api_1.getCurrentOwnerId)();
            const content = await backup.create(ownerId, this.data.exportPassword);
            const path = `${wx.env.USER_DATA_PATH}/aimap-backup.aimap`;
            await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({
                filePath: path,
                data: content,
                encoding: "utf8",
                success: resolve,
                fail: () => reject(new Error("备份文件写入失败，请检查存储空间")),
            }));
            this.setData({ exportPassword: "" });
            if (!wx.shareFileMessage)
                throw new Error("当前微信版本不支持分享文件，请更新微信");
            await new Promise((resolve, reject) => wx.shareFileMessage({
                filePath: path,
                fileName: "aimap-backup.aimap",
                success: resolve,
                fail: () => reject(new Error("文件已加密生成，但分享未完成，请重试")),
            }));
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
        finally {
            this.setData({ busy: false, busyMessage: "" });
        }
    },
    chooseFile() {
        if (this.data.busy)
            return;
        wx.chooseMessageFile({
            count: 1,
            type: "file",
            extension: ["aimap"],
            success: (result) => {
                const file = result.tempFiles[0];
                if (!file || file.size > 24 * 1024 * 1024)
                    return (0, api_1.showError)(new Error("备份文件不能超过24MB"));
                this.setData({
                    selectedName: file.name,
                    selectedPath: file.path,
                    preview: null,
                    pending: null,
                });
            },
            fail: () => (0, api_1.showError)(new Error("未选择备份文件")),
        });
    },
    async inspect() {
        if (this.data.busy || !this.data.selectedPath)
            return;
        this.setData({
            busy: true,
            busyMessage: "正在解密并核对备份…",
            preview: null,
            pending: null,
        });
        try {
            const ownerId = await (0, api_1.getCurrentOwnerId)();
            const content = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
                filePath: this.data.selectedPath,
                encoding: "utf8",
                success: (result) => resolve(result.data),
                fail: () => reject(new Error("备份文件无法读取")),
            }));
            const pending = await backup.openAsync(content, this.data.importPassword, ownerId);
            const current = local.read(ownerId);
            if (!current)
                throw new Error("本机资料尚未初始化，请先完成注册并重试");
            this.setData({
                preview: backup.preview(current, pending),
                pending,
                importPassword: "",
            });
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
        finally {
            this.setData({ busy: false, busyMessage: "" });
        }
    },
    restoreData() {
        if (!this.data.pending || this.data.busy)
            return;
        this.setData({ busy: true, busyMessage: "等待确认恢复" });
        wx.showModal({
            title: "替换本机数据",
            content: "将用备份中的资料、联系人和关系覆盖当前手机数据。当前手机独有的改动将丢失，建议先导出备份。",
            confirmText: "确认替换",
            success: async (result) => {
                if (!result.confirm) {
                    this.setData({ busy: false, busyMessage: "" });
                    return;
                }
                this.setData({ busy: true, busyMessage: "正在恢复并同步公开资料…" });
                try {
                    const ownerId = await (0, api_1.getCurrentOwnerId)();
                    const previous = local.read(ownerId);
                    if (!previous)
                        throw new Error("本机资料尚未初始化，请先完成注册并重试");
                    const token = await backup.restore(ownerId, this.data.pending);
                    try {
                        const restored = local.read(ownerId);
                        if (!restored)
                            throw new Error("恢复后的资料无法读取，请重新登录检查");
                        if (previous.profile.visibility.nickname ||
                            restored.profile.visibility.nickname ||
                            ["pending", "error"].includes(previous.profile.publicationStatus))
                            await (0, api_1.syncPublishedProfile)(restored.profile);
                    }
                    catch (error) {
                        if (error.ambiguous) {
                            this.setData({
                                selectedName: "",
                                selectedPath: "",
                                preview: null,
                                pending: null,
                            });
                            throw error;
                        }
                        if (!backup.rollbackRestore(ownerId, token)) {
                            this.setData({
                                selectedName: "",
                                selectedPath: "",
                                preview: null,
                                pending: null,
                            });
                            throw new Error("公开资料同步失败。为保护恢复后的新改动，已保留本机数据，请到隐私设置重试同步。");
                        }
                        throw error;
                    }
                    this.setData({
                        selectedName: "",
                        selectedPath: "",
                        preview: null,
                        pending: null,
                    });
                    wx.showToast({ title: "恢复成功", icon: "success" });
                }
                catch (error) {
                    (0, api_1.showError)(error);
                }
                finally {
                    this.setData({ busy: false, busyMessage: "" });
                }
            },
            fail: () => this.setData({ busy: false, busyMessage: "" }),
        });
    },
});
