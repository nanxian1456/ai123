const CryptoJS = require("../vendor/crypto-js");
const local = require("./local-data");
const workerKeys = require("./backup-worker");
const FORMAT = "aimap-backup";
const ROUNDS = 100000;
const MAX_FILE_CHARS = 24 * 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
function validAvatar(value) {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 || value.length % 4 !== 0) return false;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  if (/[^A-Za-z0-9+/]/.test(value.slice(0, value.length - padding))) return false;
  const bytes = value.length / 4 * 3 - padding;
  return bytes <= MAX_AVATAR_BYTES;
}

function randomHex(length) {
  return new Promise((resolve, reject) => {
    if (!wx.getRandomValues) return reject(new Error("当前微信版本不支持安全随机数，请更新微信"));
    wx.getRandomValues({ length, success(result) {
      const bytes = new Uint8Array(result.randomValues);
      if (bytes.length !== length) return reject(new Error("安全随机数生成失败"));
      resolve(Array.from(bytes, value => value.toString(16).padStart(2, "0")).join(""));
    }, fail: () => reject(new Error("安全随机数生成失败")) });
  });
}
function keys(password, salt, rounds) {
  const material = CryptoJS.PBKDF2(password, CryptoJS.enc.Hex.parse(salt), { keySize: 16, iterations: rounds, hasher: CryptoJS.algo.SHA256 });
  const hex = material.toString(CryptoJS.enc.Hex);
  return parseKeys(hex);
}
function parseKeys(hex) {
  return [CryptoJS.enc.Hex.parse(hex.slice(0, 64)), CryptoJS.enc.Hex.parse(hex.slice(64))];
}
function signedContent(file) { return [FORMAT, file.version, file.rounds, file.salt, file.iv, file.ciphertext].join("|"); }
function validateData(data, ownerId) {
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const field = (value, limit, required = false) => (value == null && !required) || (typeof value === "string" && value.length <= limit && (!required || !!value.trim()));
  const id = value => Number.isSafeInteger(value) && value > 0;
  if (!data || data.version !== 1 || !data.profile || data.profile.ownerId !== ownerId || !Array.isArray(data.contacts) || !Array.isArray(data.relationships)) throw new Error("备份数据格式无效");
  const profile = data.profile;
  if (!object(profile) || !object(profile.visibility) || ["avatar", "nickname", "organization", "position", "city", "bio"].some(name => typeof profile.visibility[name] !== "boolean") ||
      [["nickname", 30], ["organization", 100], ["position", 100], ["city", 100], ["bio", 500], ["avatarUrl", 2048], ["contactCode", 100]].some(([name, limit]) => !field(profile[name], limit)) ||
      !["male-1", "male-2", "female-1", "female-2"].includes(profile.avatarType) || typeof profile.profileCompleted !== "boolean") throw new Error("备份个人资料或公开设置无效");
  if (data.contacts.some(item => !object(item) || item.ownerId !== ownerId || !id(item.id)) || data.relationships.some(item => !object(item) || item.ownerId !== ownerId || !id(item.id))) throw new Error("备份账号或编号无效，可能包含其他账号的数据");
  if (data.contacts.some(item => !field(item.name, 50, true) || [["organization", 100], ["position", 50], ["city", 50], ["province", 50], ["phone", 30], ["email", 100], ["note", 500]].some(([name, limit]) => !field(item[name], limit)) ||
      (item.phone && !/^[0-9+()\- ]{6,30}$/.test(item.phone)) || (item.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) ||
      (item.tags != null && (!Array.isArray(item.tags) || item.tags.length > 10 || item.tags.some(tag => !field(tag, 20, true)) || new Set(item.tags).size !== item.tags.length)))) throw new Error("备份联系人字段无效");
  if (data.relationships.some(item => !id(item.sourceId) || !id(item.targetId) || item.sourceId === item.targetId || !field(item.type, 30, true) || !field(item.note, 200))) throw new Error("备份关系字段无效");
  if (data.tagCatalog != null && (!Array.isArray(data.tagCatalog) || data.tagCatalog.length > 100 || data.tagCatalog.some(name => typeof name !== "string" || !name.trim() || name !== name.trim() || name.length > 20) || new Set(data.tagCatalog).size !== data.tagCatalog.length)) throw new Error("备份标签目录无效");
  const contactIds = new Set(data.contacts.map(item => item.id));
  const relationshipIds = new Set(data.relationships.map(item => item.id));
  if (contactIds.size !== data.contacts.length || relationshipIds.size !== data.relationships.length ||
      data.relationships.some(item => !contactIds.has(item.sourceId) || !contactIds.has(item.targetId)) ||
      !id(data.nextContactId) || !id(data.nextRelationshipId) ||
      data.nextContactId <= data.contacts.reduce((max, item) => Math.max(max, item.id), 0) ||
      data.nextRelationshipId <= data.relationships.reduce((max, item) => Math.max(max, item.id), 0)) throw new Error("备份记录关联或编号无效");
  return data;
}
async function create(ownerId, password) {
  if (typeof password !== "string" || password.length < 10) throw new Error("备份密码至少10位");
  const data = validateData(local.read(ownerId), ownerId);
  const salt = await randomHex(16);
  const iv = await randomHex(16);
  const avatarPath = data.profile.avatarUrl || "";
  const avatar = avatarPath ? await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: avatarPath, encoding: "base64", success: result => resolve(result.data), fail: () => reject(new Error("本机头像无法读取，备份已取消")) })) : "";
  if (!validAvatar(avatar)) throw new Error("本机头像数据无效或超过5MB，备份已取消");
  const [encryptionKey, macKey] = parseKeys(await workerKeys.derive(password, salt));
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify({ data, avatar }), encryptionKey, { iv: CryptoJS.enc.Hex.parse(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).ciphertext.toString(CryptoJS.enc.Base64);
  const file = { format: FORMAT, version: 1, rounds: ROUNDS, salt, iv, ciphertext };
  file.mac = CryptoJS.HmacSHA256(signedContent(file), macKey).toString(CryptoJS.enc.Hex);
  return JSON.stringify(file);
}
function parseBackup(content, password) {
  if (typeof password !== "string" || password.length < 10) throw new Error("备份密码至少10位");
  if (typeof content !== "string") throw new Error("备份文件格式无效");
  if (content.length > MAX_FILE_CHARS) throw new Error("备份文件不能超过24MB");
  let file;
  try { file = JSON.parse(content); } catch (_) { throw new Error("备份文件格式无效"); }
  if (!file || file.format !== FORMAT || file.version !== 1 || file.rounds !== ROUNDS || !/^[0-9a-f]{32}$/.test(file.salt) || !/^[0-9a-f]{32}$/.test(file.iv) || !/^[0-9a-f]{64}$/.test(file.mac) || typeof file.ciphertext !== "string") throw new Error("备份文件格式或版本不受支持");
  return file;
}
function open(content, password, ownerId) {
  const file = parseBackup(content, password);
  return openWithKeys(file, keys(password, file.salt, file.rounds), ownerId);
}
async function openAsync(content, password, ownerId) {
  const file = parseBackup(content, password);
  return openWithKeys(file, parseKeys(await workerKeys.derive(password, file.salt)), ownerId);
}
function openWithKeys(file, [encryptionKey, macKey], ownerId) {
  const actual = CryptoJS.HmacSHA256(signedContent(file), macKey).toString(CryptoJS.enc.Hex);
  let mismatch = 0;
  for (let index = 0; index < actual.length; index++) mismatch |= actual.charCodeAt(index) ^ file.mac.charCodeAt(index);
  if (mismatch) throw new Error("备份密码错误或文件已损坏");
  let data;
  try {
    const bytes = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(file.ciphertext) }, encryptionKey, { iv: CryptoJS.enc.Hex.parse(file.iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
    data = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  } catch (_) { throw new Error("备份文件无法解密"); }
  if (!data || !validAvatar(data.avatar)) throw new Error("备份内容格式无效");
  validateData(data.data, ownerId);
  return data;
}
function preview(current, incoming) {
  return { currentContacts: current.contacts.length, currentRelationships: current.relationships.length, backupContacts: incoming.data.contacts.length, backupRelationships: incoming.data.relationships.length };
}
async function restore(ownerId, incoming) {
  if (!incoming || !validAvatar(incoming.avatar)) throw new Error("头像数据格式无效或超过5MB");
  validateData(incoming.data, ownerId);
  const previous = local.read(ownerId);
  const before = JSON.stringify(previous);
  const data = JSON.parse(JSON.stringify(incoming.data));
  if (incoming.avatar) {
    const path = `${wx.env.USER_DATA_PATH}/aimap-avatar-${Date.now()}.jpg`;
    await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath: path, data: incoming.avatar, encoding: "base64", success: resolve, fail: () => reject(new Error("头像无法写入手机，恢复已取消")) }));
    data.profile.avatarUrl = path;
  } else data.profile.avatarUrl = "";
  if (JSON.stringify(local.read(ownerId)) !== before) throw new Error("本机数据已变化，恢复已取消，请重新预览备份");
  local.write(ownerId, data);
  return { ownerId, previous, restored: JSON.stringify(data) };
}
function rollbackRestore(ownerId, token) {
  if (!token || token.ownerId !== ownerId) return false;
  const current = local.read(ownerId);
  // Publication status is bookkeeping and does not invalidate the restore snapshot.
  const restored = JSON.parse(token.restored);
  if (current && current.profile) delete current.profile.publicationStatus;
  if (restored && restored.profile) delete restored.profile.publicationStatus;
  if (JSON.stringify(current) !== JSON.stringify(restored)) return false;
  local.write(ownerId, token.previous);
  return true;
}
module.exports = { create, open, openAsync, preview, restore, rollbackRestore };
