const RECOMMENDED = ["公司", "大学", "朋友", "亲人", "同学", "同事", "客户", "合作伙伴", "校友", "邻居"];
const invalid = () => new Error("分类数据无效，请检查分类名称、层级和联系人归类");
function nameOf(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 20) throw invalid();
  return value.trim();
}
function inspect(data, strict = true) {
  const tree = data.categoryTree === undefined ? [] : data.categoryTree;
  if (!Array.isArray(tree)) throw invalid();
  const byId = new Map();
  const stack = tree.map(node => ({ node, siblings: tree, depth: 1 }));
  let maximum = 0;
  while (stack.length) {
    const { node, siblings, depth } = stack.pop();
    if (!node || typeof node !== "object" || !/^cat[1-9]\d*$/.test(node.id) || byId.has(node.id) ||
        !Array.isArray(node.children) || nameOf(node.name) !== node.name || (strict && (depth > 16 || byId.size >= 1000))) throw invalid();
    const number = Number(node.id.slice(3));
    if (!Number.isSafeInteger(number)) throw invalid();
    maximum = Math.max(maximum, number);
    byId.set(node.id, { node, siblings, depth });
    node.children.forEach(child => stack.push({ node: child, siblings: node.children, depth: depth + 1 }));
  }
  if (data.nextCategoryId !== undefined && (!Number.isSafeInteger(data.nextCategoryId) || data.nextCategoryId <= maximum)) throw invalid();
  const dismissed = data.dismissedCategories === undefined ? [] : data.dismissedCategories;
  if (!Array.isArray(dismissed) || (strict && dismissed.length > 1000) || new Set(dismissed).size !== dismissed.length || dismissed.some(name => nameOf(name) !== name)) throw invalid();
  return { tree, byId, maximum, dismissed };
}
// Like the archive version, stored or migrated category data is read leniently:
// odd entries are repaired in place instead of making the graph fail to load.
// Backup files still go through the strict validate() below.
function normalize(data) {
  const used = new Set();
  const renamed = new Map();
  const pending = [];
  let maximum = 0;
  const repairList = (list, depth) => (Array.isArray(list) ? list : []).filter(node => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const name = typeof node.name === "string" ? node.name.trim().slice(0, 20) : "";
    node.name = name || "未命名分类";
    const valid = typeof node.id === "string" && /^cat[1-9]\d*$/.test(node.id) && Number.isSafeInteger(Number(node.id.slice(3))) && !used.has(node.id);
    if (valid) { used.add(node.id); maximum = Math.max(maximum, Number(node.id.slice(3))); }
    else pending.push(node);
    node.children = repairList(node.children, depth + 1);
    return true;
  });
  data.categoryTree = repairList(data.categoryTree, 1);
  let next = Math.max(maximum + 1, Number.isSafeInteger(data.nextCategoryId) ? data.nextCategoryId : 1);
  for (const node of pending) {
    const id = `cat${next++}`;
    if (node.id != null && !renamed.has(String(node.id))) renamed.set(String(node.id), id);
    node.id = id;
    used.add(id);
  }
  data.nextCategoryId = next;
  const dismissed = Array.isArray(data.dismissedCategories) ? data.dismissedCategories : [];
  data.dismissedCategories = [...new Set(dismissed.filter(name => typeof name === "string" && name.trim()).map(name => name.trim().slice(0, 20)))];
  for (const contact of Array.isArray(data.contacts) ? data.contacts : []) {
    if (!contact || contact.categoryIds === undefined) continue;
    const ids = (Array.isArray(contact.categoryIds) ? contact.categoryIds : [])
      .map(id => (used.has(id) ? id : renamed.get(String(id))))
      .filter(Boolean);
    contact.categoryIds = [...new Set(ids)].slice(0, 20);
  }
  return data;
}
function checkedIds(index, ids) {
  if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => typeof id !== "string" || !index.byId.has(id))) throw invalid();
  return [...new Set(ids)];
}
function contactIds(data, ids) { return checkedIds(inspect(normalize(data), false), ids); }
function validate(data) {
  // Creation limits must not prevent existing, structurally valid data from being backed up.
  const index = inspect(data, false);
  for (const contact of data.contacts || []) {
    if (contact.categoryIds !== undefined && checkedIds(index, contact.categoryIds).length !== contact.categoryIds.length) throw invalid();
  }
  return data;
}
function handle(data, path, method, payload) {
  const index = inspect(normalize(data), false);
  if (path === "/categories" && method === "GET") {
    const used = new Set([...index.byId.values()].map(({ node }) => node.name));
    return { tree: index.tree, recommended: RECOMMENDED.filter(name => !used.has(name) && !index.dismissed.includes(name)), dismissed: [...index.dismissed] };
  }
  if (path === "/categories" && method === "POST") {
    const name = nameOf(payload && payload.name);
    const parent = payload.parentId ? index.byId.get(payload.parentId) : null;
    if (payload.parentId && !parent) throw new Error("父分类不存在");
    if (index.byId.size >= 1000 || (parent && parent.depth >= 16)) throw new Error("分类最多1000个、层级最多16级");
    const next = data.nextCategoryId === undefined ? index.maximum + 1 : data.nextCategoryId;
    if (!Number.isSafeInteger(next + 1)) throw invalid();
    const node = { id: `cat${next}`, name, children: [] };
    data.categoryTree = index.tree;
    (parent ? parent.node.children : data.categoryTree).push(node);
    data.nextCategoryId = next + 1;
    return node;
  }
  if ((path === "/categories/dismiss" || path === "/categories/restore") && method === "POST") {
    const name = nameOf(payload && payload.name);
    const dismissed = new Set(index.dismissed);
    if (path.endsWith("/dismiss")) dismissed.add(name); else dismissed.delete(name);
    if (dismissed.size > 1000) throw invalid();
    data.dismissedCategories = [...dismissed];
    return { name };
  }
  const members = path.match(/^\/categories\/(cat[1-9]\d*)\/contacts$/);
  if (members && method === "POST") {
    if (!index.byId.has(members[1])) throw new Error("分类不存在");
    const ids = payload && payload.contactIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => !Number.isSafeInteger(id))) throw new Error("请选择要导入的联系人");
    const targets = [...new Set(ids)].map(id => {
      const contact = (data.contacts || []).find(item => item.id === id);
      if (!contact) throw new Error("联系人不存在，请刷新后重试");
      return contact;
    });
    // Check every contact first so a rejected import changes nothing.
    const full = targets.find(contact => !(contact.categoryIds || []).includes(members[1]) && (contact.categoryIds || []).length >= 20);
    if (full) throw new Error(`「${full.name}」已归入20个分类，无法继续归类`);
    let added = 0;
    targets.forEach(contact => {
      const current = contact.categoryIds || [];
      if (current.includes(members[1])) return;
      contact.categoryIds = [...current, members[1]];
      added++;
    });
    return { added };
  }
  const match = path.match(/^\/categories\/(cat[1-9]\d*)$/);
  if (match && (method === "PATCH" || method === "DELETE")) {
    const found = index.byId.get(match[1]);
    if (!found) throw new Error("分类不存在");
    if (method === "PATCH") { found.node.name = nameOf(payload && payload.name); return found.node; }
    const removed = new Set();
    const pending = [found.node];
    while (pending.length) { const node = pending.pop(); removed.add(node.id); pending.push(...node.children); }
    found.siblings.splice(found.siblings.indexOf(found.node), 1);
    data.contacts.forEach(contact => {
      if (Array.isArray(contact.categoryIds)) contact.categoryIds = contact.categoryIds.filter(id => !removed.has(id));
    });
    return null;
  }
  throw new Error("分类接口暂不支持此操作");
}
module.exports = { handle, validate, normalize, contactIds };
