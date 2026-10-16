const CryptoJS = require("../vendor/crypto-js");
const local = require("./local-data");
const FORMAT = "aimap-backup";
const ROUNDS = 100000;

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
  return [CryptoJS.enc.Hex.parse(hex.slice(0, 64)), CryptoJS.enc.Hex.parse(hex.slice(64))];
}
function signedContent(file) { return [FORMAT, file.version, file.rounds, file.salt, file.iv, file.ciphertext].join("|"); }
function validateData(data, ownerId) {
  if (!data || data.version !== 1 || !data.profile || data.profile.ownerId !== ownerId || !Array.isArray(data.contacts) || !Array.isArray(data.relationships)) throw new Error("备份数据格式无效");
  if (data.contacts.some(item => item.ownerId !== ownerId || !Number.isSafeInteger(item.id)) || data.relationships.some(item => item.ownerId !== ownerId || !Number.isSafeInteger(item.id))) throw new Error("备份包含其他账号的数据");
  if (data.tagCatalog != null && (!Array.isArray(data.tagCatalog) || data.tagCatalog.some(name => typeof name !== "string" || !name.trim() || name.length > 20) || new Set(data.tagCatalog).size !== data.tagCatalog.length)) throw new Error("备份标签目录无效");
  const contactIds = new Set(data.contacts.map(item => item.id));
  const relationshipIds = new Set(data.relationships.map(item => item.id));
  if (contactIds.size !== data.contacts.length || relationshipIds.size !== data.relationships.length ||
      data.relationships.some(item => !contactIds.has(item.sourceId) || !contactIds.has(item.targetId)) ||
      !Number.isSafeInteger(data.nextContactId) || !Number.isSafeInteger(data.nextRelationshipId) ||
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
  const [encryptionKey, macKey] = keys(password, salt, ROUNDS);
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify({ data, avatar }), encryptionKey, { iv: CryptoJS.enc.Hex.parse(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).ciphertext.toString(CryptoJS.enc.Base64);
  const file = { format: FORMAT, version: 1, rounds: ROUNDS, salt, iv, ciphertext };
  file.mac = CryptoJS.HmacSHA256(signedContent(file), macKey).toString(CryptoJS.enc.Hex);
  return JSON.stringify(file);
}
function open(content, password, ownerId) {
  let file;
  try { file = JSON.parse(content); } catch (_) { throw new Error("备份文件格式无效"); }
  if (!file || file.format !== FORMAT || file.version !== 1 || file.rounds !== ROUNDS || !/^[0-9a-f]{32}$/.test(file.salt) || !/^[0-9a-f]{32}$/.test(file.iv) || !/^[0-9a-f]{64}$/.test(file.mac) || typeof file.ciphertext !== "string") throw new Error("备份文件格式或版本不受支持");
  const [encryptionKey, macKey] = keys(password, file.salt, file.rounds);
  const actual = CryptoJS.HmacSHA256(signedContent(file), macKey).toString(CryptoJS.enc.Hex);
  let mismatch = 0;
  for (let index = 0; index < actual.length; index++) mismatch |= actual.charCodeAt(index) ^ file.mac.charCodeAt(index);
  if (mismatch) throw new Error("备份密码错误或文件已损坏");
  let data;
  try {
    const bytes = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(file.ciphertext) }, encryptionKey, { iv: CryptoJS.enc.Hex.parse(file.iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
    data = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  } catch (_) { throw new Error("备份文件无法解密"); }
  if (!data || typeof data.avatar !== "string") throw new Error("备份内容格式无效");
  validateData(data.data, ownerId);
  return data;
}
function preview(current, incoming) {
  return { currentContacts: current.contacts.length, currentRelationships: current.relationships.length, backupContacts: incoming.data.contacts.length, backupRelationships: incoming.data.relationships.length };
}
async function restore(ownerId, incoming) {
  validateData(incoming.data, ownerId);
  const data = incoming.data;
  if (incoming.avatar) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(incoming.avatar)) throw new Error("头像数据格式无效");
    const path = `${wx.env.USER_DATA_PATH}/aimap-avatar-${Date.now()}.jpg`;
    await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath: path, data: incoming.avatar, encoding: "base64", success: resolve, fail: () => reject(new Error("头像无法写入手机，恢复已取消")) }));
    data.profile.avatarUrl = path;
  } else data.profile.avatarUrl = "";
  local.write(ownerId, data);
}
module.exports = { create, open, preview, restore };
