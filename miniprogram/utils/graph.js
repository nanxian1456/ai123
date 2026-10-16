/**
 * 关系图谱 · 纯计算引擎（不依赖 wx / DOM，可在 node 下单测）
 *
 * 数据模型：
 *  - 联系人   → person 节点
 *  - 单位/城市 → 由联系人派生出的 org / city 节点（与对应联系人用「任职于 / 位于」虚线边相连）
 *  - 关系记录 → person ↔ person 的 relation 边（合作 / 同事 / 朋友 …）
 *
 * 力导向布局采用「斥力 + 弹簧 + 向心力」三步迭代，stepForce 每调用一次推进一步，
 * 页面侧用 requestAnimationFrame 分帧推进，避免一次性阻塞主线程。
 */

const KIND_COLORS = {
  person: "#2563eb", // 联系人（主蓝）
  org: "#18a88e",    // 单位（青绿）
  city: "#d89134"    // 城市（琥珀）
};

const KIND_LABELS = {
  person: "联系人",
  org: "单位",
  city: "城市"
};

const NODE_TYPES = [
  { key: "person", label: KIND_LABELS.person, color: KIND_COLORS.person },
  { key: "org", label: KIND_LABELS.org, color: KIND_COLORS.org },
  { key: "city", label: KIND_LABELS.city, color: KIND_COLORS.city }
];

function safeId(prefix, value) {
  // 单位 / 城市可能含特殊字符，统一用前缀 + 编码，避免 id 冲突。
  return `${prefix}${encodeURIComponent(String(value))}`;
}

function buildGraph(contacts, relationships) {
  const nodes = [];
  const nodeById = new Map();

  function ensureNode(node) {
    if (!nodeById.has(node.id)) {
      node.degree = 0;
      nodeById.set(node.id, node);
      nodes.push(node);
    }
    return nodeById.get(node.id);
  }

  (contacts || []).forEach((contact) => {
    ensureNode({
      id: `p${contact.id}`,
      kind: "person",
      label: contact.name || "未命名",
      sub: contact.organization || contact.city || "",
      tags: contact.tags || [],
      ref: contact.id // 对应本地联系人 id，便于跳转详情
    });
  });

  // 派生 单位 / 城市 节点
  (contacts || []).forEach((contact) => {
    if (contact.organization) {
      ensureNode({ id: safeId("o", contact.organization), kind: "org", label: contact.organization, sub: "单位", ref: null });
    }
    if (contact.city) {
      ensureNode({ id: safeId("c", contact.city), kind: "city", label: contact.city, sub: "城市", ref: null });
    }
  });

  const edges = [];
  const relTypeCount = new Map();

  (relationships || []).forEach((rel) => {
    const source = `p${rel.sourceId}`;
    const target = `p${rel.targetId}`;
    if (!nodeById.has(source) || !nodeById.has(target)) return; // 悬空关系（端点已删除）跳过
    const type = rel.type || "关系";
    edges.push({
      id: `r${rel.id}`,
      source,
      target,
      kind: "relation",
      type,
      note: rel.note || "",
      ref: rel.id
    });
    relTypeCount.set(type, (relTypeCount.get(type) || 0) + 1);
  });

  // 归属边：联系人 → 单位 / 城市
  (contacts || []).forEach((contact) => {
    if (contact.organization) {
      edges.push({ id: `ao${contact.id}`, source: `p${contact.id}`, target: safeId("o", contact.organization), kind: "affiliation", type: "任职于", dashed: true });
    }
    if (contact.city) {
      edges.push({ id: `ac${contact.id}`, source: `p${contact.id}`, target: safeId("c", contact.city), kind: "affiliation", type: "位于", dashed: true });
    }
  });

  // 计算度数
  edges.forEach((edge) => {
    if (nodeById.has(edge.source)) nodeById.get(edge.source).degree += 1;
    if (nodeById.has(edge.target)) nodeById.get(edge.target).degree += 1;
  });

  const relTypes = Array.from(relTypeCount, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { nodes, edges, nodeTypes: NODE_TYPES, relTypes, nodeById };
}

// 把 edges 转成索引对，供 stepForce 高速迭代使用。
function buildEdgePairs(nodes, edges) {
  const indexById = new Map();
  nodes.forEach((node, index) => indexById.set(node.id, index));
  return edges
    .map((edge) => [indexById.get(edge.source), indexById.get(edge.target), edge.kind])
    .filter((pair) => typeof pair[0] === "number" && typeof pair[1] === "number");
}

function initPositions(nodes, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const n = Math.max(1, nodes.length);
  nodes.forEach((node, index) => {
    const angle = (index / n) * Math.PI * 2;
    const radius = 30 + Math.sqrt(index + 1) * 16;
    node.x = cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 8;
    node.y = cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 8;
    node.vx = 0;
    node.vy = 0;
    node.fixed = false;
  });
}

/**
 * 推进一次力导向迭代，返回本步总位移（用于判断稳定）。
 * params: { width, height, repulse, spring, restRelation, restAffiliation, center, damping }
 */
function stepForce(nodes, edgePairs, params) {
  const {
    width,
    height,
    repulse = 9000,
    spring = 0.045,
    restRelation = 92,
    restAffiliation = 58,
    center = 0.014,
    damping = 0.82
  } = params || {};
  const cx = width / 2;
  const cy = height / 2;
  let movement = 0;

  // 斥力（节点两两相斥）
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        d2 = 0.01;
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
      }
      const distance = Math.sqrt(d2);
      const force = repulse / d2;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      if (!a.fixed) { a.vx += fx; a.vy += fy; }
      if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
    }
  }

  // 弹簧（边两端相吸， affiliation 更短更紧）
  for (let k = 0; k < edgePairs.length; k += 1) {
    const [s, t, kind] = edgePairs[k];
    const a = nodes[s];
    const b = nodes[t];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const rest = kind === "affiliation" ? restAffiliation : restRelation;
    const force = (distance - rest) * spring;
    const fx = (dx / distance) * force;
    const fy = (dy / distance) * force;
    if (!a.fixed) { a.vx += fx; a.vy += fy; }
    if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
  }

  // 向心力 + 积分
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    node.vx += (cx - node.x) * center;
    node.vy += (cy - node.y) * center;
    node.vx *= damping;
    node.vy *= damping;
    if (node.fixed) { node.vx = 0; node.vy = 0; continue; }
    node.x += node.vx;
    node.y += node.vy;
    movement += Math.abs(node.vx) + Math.abs(node.vy);
  }
  return movement;
}

// 无向邻接表，供 N 度 / 最短路径使用
function buildAdjacency(nodes, edges) {
  const adj = new Map();
  nodes.forEach((node) => adj.set(node.id, []));
  edges.forEach((edge) => {
    if (!adj.has(edge.source) || !adj.has(edge.target)) return;
    adj.get(edge.source).push(edge.target);
    adj.get(edge.target).push(edge.source);
  });
  return adj;
}

// 返回从 startId 出发 depth 度以内可达的所有节点 id（含起点）
function neighborsWithin(adj, startId, depth) {
  const visited = new Set([startId]);
  let frontier = [startId];
  const levels = Math.max(0, depth | 0);
  for (let d = 0; d < levels; d += 1) {
    const next = [];
    frontier.forEach((id) => {
      (adj.get(id) || []).forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      });
    });
    frontier = next;
  }
  return visited;
}

// BFS 最短路径，返回节点 id 数组（含起止），不可达返回 null
function shortestPath(adj, startId, endId) {
  if (startId === endId) return [startId];
  if (!adj.has(startId) || !adj.has(endId)) return null;
  const prev = new Map([[startId, null]]);
  const queue = [startId];
  let found = false;
  while (queue.length && !found) {
    const current = queue.shift();
    const neighbors = adj.get(current) || [];
    for (let i = 0; i < neighbors.length; i += 1) {
      const neighbor = neighbors[i];
      if (!prev.has(neighbor)) {
        prev.set(neighbor, current);
        if (neighbor === endId) { found = true; break; }
        queue.push(neighbor);
      }
    }
  }
  if (!prev.has(endId)) return null;
  const path = [];
  let cursor = endId;
  while (cursor != null) {
    path.unshift(cursor);
    cursor = prev.get(cursor);
  }
  return path;
}

// 按度数降序取 TOP N，附带名次
function degreeRank(nodes, topN = 10) {
  return nodes
    .slice()
    .sort((a, b) => b.degree - a.degree)
    .slice(0, topN)
    .map((node, index) => ({ ...node, rank: index + 1 }));
}

// 以「自己」为中心的分类树：self → 用户定义的分类（可多级）→ 联系人（叶子）
function buildCategoryGraph(profile, categoryTree, contacts, recommended) {
  const nodes = [];
  const edges = [];
  const nodeById = new Map();
  function add(node) {
    if (!nodeById.has(node.id)) {
      node.depth = 0;
      nodeById.set(node.id, node);
      nodes.push(node);
    }
    return nodeById.get(node.id);
  }
  const self = add({ id: "self", kind: "self", label: (profile && profile.nickname) || "自己", sub: "我", children: [], depth: 0 });
  function walk(treeNodes, parent) {
    (treeNodes || []).forEach((treeNode) => {
      const node = add({ id: treeNode.id, kind: "category", label: treeNode.name, name: treeNode.name, recommended: false, synthetic: false, parentId: parent.id, children: [], depth: parent.depth + 1 });
      parent.children.push(node.id);
      edges.push({ id: `e${node.id}`, source: parent.id, target: node.id, kind: "tree" });
      walk(treeNode.children || [], node);
    });
  }
  walk(categoryTree, self);
  (recommended || []).forEach((name) => {
    const node = add({ id: `rec:${name}`, kind: "category", label: name, name, recommended: true, synthetic: false, parentId: "self", children: [], depth: 1 });
    self.children.push(node.id);
    edges.push({ id: `e${node.id}`, source: "self", target: node.id, kind: "tree", recommended: true });
  });
  // 未归入任何分类的联系人 → 汇总到「未分类」（仅作为分类分支；联系人本身不画在画布上，点分支时在抽屉里查看）
  const orphans = (contacts || []).filter((contact) => !(contact.categoryIds || []).some((categoryId) => {
    const parent = nodeById.get(categoryId);
    return parent && parent.kind === "category";
  }));
  if (orphans.length) {
    const uncat = add({ id: "uncat", kind: "category", label: "未分类", name: "未分类", recommended: false, synthetic: true, parentId: "self", children: [], depth: 1 });
    self.children.push(uncat.id);
    edges.push({ id: "e-uncat", source: "self", target: uncat.id, kind: "tree" });
  }
  return { nodes, edges, nodeById, selfId: "self" };
}

// 收集以 rootId 为根的子树所有节点 id（含根本身），沿 children 向下遍历。供标签树「聚焦某分支」使用。
function collectTreeIds(nodeById, rootId) {
  const out = [];
  const stack = [rootId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id) || !nodeById.has(id)) continue;
    seen.add(id);
    out.push(id);
    const node = nodeById.get(id);
    (node.children || []).forEach((child) => stack.push(child));
  }
  return out;
}

// 径向布局：self 居中，子节点按权重在扇形区间内分配角度，逐层向外
function radialLayout(nodes, edges, options) {
  const { width, height, ringGap = 92, startAngle = -Math.PI / 2 } = options || {};
  const cx = width / 2;
  const cy = height / 2;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map();
  nodes.forEach((n) => childrenOf.set(n.id, []));
  edges.forEach((e) => { if (childrenOf.has(e.source)) childrenOf.get(e.source).push(e.target); });
  const weight = new Map();
  function computeWeight(id) {
    const node = byId.get(id);
    const kids = childrenOf.get(id) || [];
    let w;
    if (!kids.length) w = node && node.kind === "contact" ? 1 : 0.6;
    else { w = 0.6; kids.forEach((k) => { w += computeWeight(k); }); }
    weight.set(id, w);
    return w;
  }
  computeWeight("self");
  const place = (id, a0, a1, radius) => {
    const node = byId.get(id);
    const angle = (a0 + a1) / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    node.x = x;
    node.y = y;
    const kids = childrenOf.get(id) || [];
    if (!kids.length) return;
    const span = a1 - a0;
    const total = kids.reduce((sum, k) => sum + (weight.get(k) || 0.6), 0);
    let current = a0;
    kids.forEach((k) => {
      const frac = ((weight.get(k) || 0.6) / total) * span;
      place(k, current, current + frac, radius + ringGap);
      current += frac;
    });
  };
  place("self", startAngle, startAngle + Math.PI * 2, 0);
  return { cx, cy };
}

module.exports = {
  KIND_COLORS,
  KIND_LABELS,
  NODE_TYPES,
  buildGraph,
  buildEdgePairs,
  initPositions,
  stepForce,
  buildAdjacency,
  neighborsWithin,
  shortestPath,
  degreeRank,
  buildCategoryGraph,
  collectTreeIds,
  radialLayout
};
