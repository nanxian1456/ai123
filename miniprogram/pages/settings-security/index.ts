import { getCurrentOwnerId, getPendingAccountDeletion, deleteAccount, showError } from "../../utils/api";
import { accountSummary } from "../../utils/account-state";
import { withdrawConsent } from "../../utils/consent";

Page({
  data: { deleting: false, loading: false, loadError: "", deletionError: "", cleanupPending: false, contacts: 0, relationships: 0 },
  deletionOwner: "",
  async onShow() {
    this.setData({ loading: true, loadError: "" });
    try {
      this.deletionOwner = getPendingAccountDeletion() || await getCurrentOwnerId();
      const cleanupPending = getPendingAccountDeletion() === this.deletionOwner;
      this.setData({ cleanupPending, ...accountSummary(this.deletionOwner) });
    } catch (error) { this.setData({ loadError: error instanceof Error ? error.message : "账号资料读取失败" }); }
    finally { this.setData({ loading: false }); }
  },
  openBackup() { if (!this.data.deleting) wx.navigateTo({ url: "/pages/data-backup/index" }); },
  openLogout() { if (!this.data.deleting) wx.navigateTo({ url: "/pages/logout/index" }); },
  async beginDeletion() {
    if (this.data.deleting || this.data.loading || !this.deletionOwner) return;
    this.setData({ deleting: true, deletionError: "" });
    try {
      if (!this.data.cleanupPending) {
        const accepted = await new Promise<boolean>(resolve => wx.showModal({
          title: "注销当前小程序账号", confirmText: "继续", cancelText: "取消",
          content: `将删除服务器账号资料、导入码、公开资料及旧联系人关系，并清空当前手机该账号的本机资料（${this.data.contacts} 位联系人、${this.data.relationships} 条关系）。请先导出备份。已生成或分享的加密备份、他人已导入的副本及其他手机本机数据不会自动删除。`,
          success: r => resolve(r.confirm), fail: () => resolve(false),
        }));
        if (!accepted) return;
        const typed = await new Promise<string>(resolve => wx.showModal({
          title: "再次确认注销", content: "此操作不可撤销。请输入“注销”后确认；这不会注销你的微信账号。", editable: true,
          placeholderText: "请输入：注销", confirmText: "确认注销", confirmColor: "#a43f37",
          success: r => resolve(r.confirm ? String(r.content || "").trim() : ""), fail: () => resolve(""),
        }));
        if (typed !== "注销") return;
      }
      await deleteAccount(this.deletionOwner);
      withdrawConsent();
      wx.reLaunch({ url: "/pages/entry/index" });
    } catch (error) {
      this.setData({ deletionError: error instanceof Error ? error.message : "注销未完成，本机资料已保留",
        cleanupPending: getPendingAccountDeletion() === this.deletionOwner });
      showError(error);
    } finally { this.setData({ deleting: false }); }
  },
});
