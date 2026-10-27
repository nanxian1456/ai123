import local = require("./local-data");

export interface BackupRecord { fileName: string; createdAt: number; contacts: number; relationships: number; bytes: number; shared: boolean; }
const historyKey = (ownerId: string) => `ai-network-backup-history:${ownerId}`;
export function timeLabel(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
  const d = new Date(value), two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
const DAY = 24 * 60 * 60 * 1000;
export const BACKUP_STALE_DAYS = 30;
export function relativeTime(value: unknown, now = Date.now()): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
  const elapsed = Math.max(0, now - value);
  if (elapsed < 60 * 1000) return "刚刚";
  if (elapsed < 60 * 60 * 1000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (elapsed < DAY) return `${Math.floor(elapsed / 3600000)} 小时前`;
  if (elapsed < BACKUP_STALE_DAYS * DAY) return `${Math.floor(elapsed / DAY)} 天前`;
  return timeLabel(value).slice(0, 10);
}
// The single file an account's latest backup is written to; a new backup replaces it.
export function backupFilePath(ownerId: string): string {
  const ownerFileId = require("../vendor/crypto-js").SHA256(ownerId).toString().slice(0, 16);
  return `${wx.env.USER_DATA_PATH}/aimap-latest-${ownerFileId}.aimap`;
}
// Whether the data is safely backed up. Only a shared file counts: an unshared one lives in the
// app's own storage and is replaced by the next backup, so it is lost with the phone.
export function backupStatus(ownerId: string, contacts: number, now = Date.now()) {
  const history = backupHistory(ownerId);
  const latest = history[0];
  const saved = history.find(row => row.shared);
  const changed = local.changedAt(ownerId);
  let backupWarning = "";
  if (latest && !latest.shared) backupWarning = "最近一次备份还没有分享保存，下次生成会替换它，请重新分享到安全位置。";
  else if (!saved) backupWarning = contacts ? "还没有备份过，换手机或清理微信后资料无法找回。" : "";
  else if (changed > saved.createdAt) backupWarning = "上次备份后资料有改动，建议重新备份。";
  else if (now - saved.createdAt > BACKUP_STALE_DAYS * DAY) backupWarning = `已超过 ${BACKUP_STALE_DAYS} 天没有备份。`;
  return {
    lastBackup: saved ? relativeTime(saved.createdAt, now) : latest ? "仅生成，尚未分享保存" : "还没有备份",
    backupWarning,
    backupUnsaved: !!latest && !latest.shared
  };
}
export function publicationView(profile: any) {
  const status = profile?.publicationStatus;
  const published = !!(profile?.visibility?.nickname && profile?.nickname);
  const title = status === "pending" ? "公开状态待确认" : status === "error" ? "公开资料同步失败" :
    status === "synced" ? (published ? "已公开选定资料" : "未公开（已同步）") : published ? "公开状态待同步" : "仅保存在本机";
  return { title, retry: status === "pending" || status === "error" || (published && status !== "synced"),
    lastSynced: timeLabel(profile?.publicationSyncedAt),
    detail: status === "pending" || status === "error" ? "服务器状态尚未确认，请联网重试同步。" :
      published ? "仅分享已选定的文字字段，联系人和头像不随导入码公开。" : "关闭公开昵称时，导入码不能导入你的资料。" };
}
export function backupHistory(ownerId: string): BackupRecord[] {
  if (!ownerId) return [];
  try {
    const rows = wx.getStorageSync(historyKey(ownerId));
    return Array.isArray(rows) ? rows.filter(row => row && typeof row.fileName === "string" && /^aimap-backup-[\d-]+\.aimap$/.test(row.fileName) &&
      Number.isFinite(row.createdAt) && Number.isInteger(row.contacts) && row.contacts >= 0 && Number.isInteger(row.relationships) && row.relationships >= 0 &&
      Number.isFinite(row.bytes) && row.bytes >= 0 && typeof row.shared === "boolean").slice(0, 5) : [];
  } catch (_) { return []; }
}
export function rememberBackup(ownerId: string, record: BackupRecord): boolean {
  if (!ownerId) return false;
  try { wx.setStorageSync(historyKey(ownerId), [record, ...backupHistory(ownerId).filter(row => row.fileName !== record.fileName)].slice(0, 5)); return true; }
  catch (_) { return false; }
}
export function accountSummary(ownerId: string) {
  const data = ownerId ? local.read(ownerId) : null;
  let usage: ReturnType<typeof local.storageUsage> = null;
  try { usage = local.storageUsage(); } catch (_) { /* Quota is optional, never invent a zero. */ }
  const contacts = data?.contacts.length || 0;
  return { contacts, relationships: data?.relationships.length || 0,
    storageLabel: usage ? `${(usage.usedKB / 1024).toFixed(1)} / ${(usage.limitKB / 1024).toFixed(1)} MB` : "当前设备暂不提供容量信息",
    storageWarning: !!usage && usage.limitKB > 0 && usage.usedKB / usage.limitKB >= .8,
    ...backupStatus(ownerId, contacts) };
}
export function forgetBackupHistory(ownerId: string) { wx.removeStorageSync(historyKey(ownerId)); local.forgetChanged(ownerId); }
export async function avatarUsage(ownerId: string): Promise<string> {
  const path = ownerId ? local.read(ownerId)?.profile.avatarUrl : "";
  if (!path) return "未设置本机头像";
  if (/^https?:/i.test(path)) return "远程头像（非本机文件）";
  const fs = wx.getFileSystemManager();
  if (typeof fs.getFileInfo !== "function") return "设备暂不提供文件大小";
  return new Promise(resolve => fs.getFileInfo({ filePath: path,
    success: result => resolve(`${(result.size / 1024).toFixed(1)} KB`), fail: () => resolve("文件暂时无法读取") }));
}
