import { request, getCurrentOwnerId } from "../../utils/api";
import { backupStatus } from "../../utils/account-state";

interface Contact { id: number; name: string; organization: string; position: string; city: string; initial?: string; }
interface Dashboard { contactCount: number; organizationCount: number; cityCount: number; recentContacts: Contact[]; }

Page({
  data: { dashboard: null as Dashboard | null, loading: true, loadError: "", backupNote: "资料保存在当前手机 · 记得定期备份", backupWarn: false },
  onShow() { this.loadDashboard(); },
  async loadDashboard() {
    this.setData({ loading: true, loadError: "" });
    try {
      const dashboard = await request<Dashboard>("/dashboard");
      dashboard.recentContacts = (dashboard.recentContacts || []).map(contact => ({ ...contact, initial: contact.name.charAt(0) }));
      this.setData({ dashboard, loading: false });
      this.updateBackupNote(dashboard.contactCount);
    } catch (error) { this.setData({ loading: false, loadError: error instanceof Error ? error.message : "本机数据读取失败" }); }
  },
  // The note turns into a warning when the data is not safely backed up.
  async updateBackupNote(contacts: number) {
    try {
      const status = backupStatus(await getCurrentOwnerId(), contacts);
      this.setData(status.backupWarning
        ? { backupNote: status.backupWarning, backupWarn: true }
        : { backupNote: `资料保存在当前手机 · 上次备份 ${status.lastBackup}`, backupWarn: false });
    } catch (_) { /* Keep the general reminder. */ }
  },
  goAdd() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
  goContacts() { wx.switchTab({ url: "/pages/contacts/index" }); },
  goMap() { wx.switchTab({ url: "/pages/map/index" }); },
  goGraph() { wx.switchTab({ url: "/pages/graph/index" }); },
  goBackup() { wx.navigateTo({ url: "/pages/data-backup/index" }); },
  goAi() { wx.navigateTo({ url: "/pages/contact-form/index?mode=ai" }); },
  openContact(event: any) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
