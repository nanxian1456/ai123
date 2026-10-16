const RECOMMENDED = ["公司", "大学", "朋友", "亲人", "同学", "同事", "客户", "合作伙伴", "校友", "邻居"];
const invalid = () => new Error("分类数据无效，请检查分类名称、层级和联系人归类");
function nameOf(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 20) throw invalid();
  return value.trim();
}
function inspect(data) {
  const tree = data.categoryTree === undefined ? [] : data.categoryTree;
  if (!Array.isArray(tree)) throw invalid();
  const byId = new Map();
  const stack = tree.map(node => ({ node, siblings: tree, depth: 1 }));
  let maximum = 0;
  while (stack.length) {
    const { node, siblings, depth } = stack.pop();
    if (!node || typeof node !== "object" || !/^cat[1-9]\d*$/.test(node.id) || byId.has(node.id) ||
        !Array.isArray(node.children) || nameOf(node.name) !== node.name || depth > 16 || byId.size >= 1000) throw invalid();
    const number = Number(node.id.slice(3));
    if (!Number.isSafeInteger(number)) throw invalid();
    maximum = Math.max(maximum, number);
    byId.set(node.id, { node, siblings, depth });
    node.children.forEach(child => stack.push({ node: child, siblings: node.children, depth: depth + 1 }));
  }
  if (data.nextCategoryId !== undefined && (!Number.isSafeInteger(data.nextCategoryId) || data.nextCategoryId <= maximum)) throw invalid();
  const dismissed = data.dismissedCategories === undefined ? [] : data.dismissedCategories;
  if (!Array.isArray(dismissed) || dismissed.length > 1000 || new Set(dismissed).size !== dismissed.length || dismissed.some(name => nameOf(name) !== name)) throw invalid();
  return { tree, byId, maximum, dismissed };
}
function checkedIds(index, ids) {
  if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => typeof id !== "string" || !index.byId.has(id))) throw invalid();
  return [...new Set(ids)];
}
function contactIds(data, ids) { return checkedIds(inspect(data), ids); }
function validate(data) {
  const index = inspect(data);
  for (const contact of data.contacts || []) {
    if (contact.categoryIds !== undefined && checkedIds(index, contact.categoryIds).length !== contact.categoryIds.length) throw invalid();
  }
  return data;
}
function handle(data, path, method, payload) {
  const index = inspect(data);
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
module.exports = { handle, validate, contactIds };
