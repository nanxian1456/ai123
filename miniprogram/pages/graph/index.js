const { request, showError } = require("../../utils/api");
const graph = require("../../utils/graph");

// 关系类型 → 颜色（稳定哈希）
const REL_PALETTE = ["#2563eb", "#18a88e", "#d89134", "#e67ba7", "#7c3aed", "#0ea5e9", "#ef6c4d", "#5b8c5a", "#94a3b8", "#c2410c"];
function relColor(type) {
  const text = String(type || "关系");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return REL_PALETTE[hash % REL_PALETTE.length];
}
function radiusFor(node) {
  const base = node.kind === "person" ? 13 : node.kind === "org" ? 11 : 10;
  const grow = Math.min(12, Math.sqrt(node.degree || 0) * 2.6);
  return base + grow;
}
function treeRadius(node) {
  if (node.id === "self") return 24;
  if (node.kind === "contact") return 11;
  return 14;
}
function truncate(text, max = 6) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
// 节点图标统一取名称首字（按码点取，兼容 emoji / 生僻字），比 truncate(…,1) 更干净。
function firstChar(text) {
  const value = String(text || "").trim();
  return value ? Array.from(value)[0] : "?";
}
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq ? ((px - x1) * dx + (py - y1) * dy) / lengthSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}
function promptName(title, placeholder) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      editable: true,
      placeholderText: placeholder || "请输入名称",
      success: (res) => resolve(res.confirm ? String(res.content || "").trim() : null)
    });
  });
}

Page({
  data: {
    loading: true,
    empty: false,
    mode: "tree", // 'tree' 标签树 | 'network' 关系网
    nodeCount: 0,
    edgeCount: 0,
    keyword: "",
    sheet: "",
    sheetTitle: "",
    selected: null,
    filters: { person: true, org: true, city: true },
    relFilter: {},
    degreeN: 2,
    rankList: [],
    legend: [],
    hint: "",
    frozen: false,
    profile: { nickname: "自己" },
    recommendedCount: 0,
    manageCategories: [],
    manageRecommended: [],
    manageDismissed: [],
    focusedBranch: "",
    focusedName: "",
    searchResults: []
  },

  // —— 非渲染状态 ——
  canvas: null,
  ctx: null,
  dpr: 1,
  cssW: 0,
  cssH: 0,
  rectLeft: 0,
  rectTop: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  canvasReady: false,
  pendingLoad: false,
  dataSig: "",
  visible: true,
  unloaded: false,
  loadId: 0,
  simEpoch: 0,

  // 网络图
  networkGraph: null,
  networkEdgePairs: null,
  networkAdjacency: null,
  simTicks: 0,
  simMax: 220,
  simRunning: false,
  isolation: null,
  pathNodes: null,
  pathEdges: null,
  pathMode: false,
  pathStart: null,
  pathEnd: null,
  selectedId: null,
  selectedEdgeId: null,
  centerId: null,

  // 标签树
  treeGraph: null,
  profile: null,
  categoryTree: null,
  recommended: [],
  contacts: [],
  relationships: [],
  selectedBranch: null,
  focusedBranch: null,

  _touch: null,
  _dragNode: null,
  _panning: false,
  _panLast: null,
  _pinching: false,
  _pinchDist: 0,
  _lastTapTime: 0,
  _lastTapId: null,
  _branchTimer: null,
  _searchTimer: null,

  onLoad() {
    this.setData({ filters: { person: true, org: true, city: true }, relFilter: {} });
  },
  onReady() { this.initCanvas(); },
  onShow() { this.visible = true; if (this.canvasReady) this.loadAll(); else this.pendingLoad = true; },
  onHide() {
    this.visible = false;
    this.simRunning = false;
    this.simEpoch++;
    for (const name of ["_branchTimer", "_searchTimer"]) {
      if (this[name]) { clearTimeout(this[name]); this[name] = null; }
    }
  },
  onUnload() { this.onHide(); this.unloaded = true; this.loadId++; },

  initCanvas() {
    wx.createSelectorQuery()
      .select("#graph")
      .fields({ node: true, size: true, rect: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const info = res[0];
        const canvas = info.node;
        const ctx = canvas.getContext("2d");
        const dpr = (typeof wx.getWindowInfo === "function" ? wx.getWindowInfo().pixelRatio : 0) || 2;
        canvas.width = info.width * dpr;
        canvas.height = info.height * dpr;
        ctx.scale(dpr, dpr);
        this.canvas = canvas;
        this.ctx = ctx;
        this.dpr = dpr;
        this.cssW = info.width;
        this.cssH = info.height;
        this.rectLeft = info.left;
        this.rectTop = info.top;
        this.canvasReady = true;
        if (this.pendingLoad) { this.pendingLoad = false; this.loadAll(); }
        else if (this.networkGraph || this.treeGraph) this.render();
      });
  },

  loadAll() {
    const loadId = ++this.loadId;
    this.setData({ loading: true });
    return Promise.all([request("/me"), request("/categories"), request("/contacts"), request("/relationships")])
      .then(([profile, catRes, contacts, relationships]) => {
        if (this.unloaded || loadId !== this.loadId) return;
        const sig = JSON.stringify([profile, catRes, contacts, relationships]);
        if (sig === this.dataSig && this.networkGraph && this.treeGraph) {
          this.setData({ loading: false }); this.updateCounts(); this.render();
          if (this.simTicks < this.simMax && !this.frozen) this.startSim();
          return;
        }
        this.dataSig = sig;
        this.simRunning = false;
        this.simEpoch++;
        this.profile = profile;
        this.categoryTree = catRes.tree || [];
        this.recommended = catRes.recommended || [];
        this.dismissed = catRes.dismissed || [];
        this.contacts = contacts;
        this.relationships = relationships;
        this.networkGraph = graph.buildGraph(contacts, relationships);
        this.networkEdgePairs = graph.buildEdgePairs(this.networkGraph.nodes, this.networkGraph.edges);
        this.networkAdjacency = graph.buildAdjacency(this.networkGraph.nodes, this.networkGraph.edges);
        this.treeGraph = graph.buildCategoryGraph(profile, this.categoryTree, contacts, this.recommended);
        graph.radialLayout(this.treeGraph.nodes, this.treeGraph.edges, { width: this.cssW, height: this.cssH });
        this.isolation = null;
        this.pathNodes = null;
        this.pathEdges = null;
        this.pathMode = false;
        this.pathStart = null;
        this.pathEnd = null;
        this.selectedId = null;
        this.selectedEdgeId = null;
        this.selectedBranch = null;
        this.focusedBranch = null;
        if (this._branchTimer) { clearTimeout(this._branchTimer); this._branchTimer = null; }
        this.setData({
          loading: false,
          empty: contacts.length === 0,
          profile: { nickname: (profile && profile.nickname) || "自己" },
          recommendedCount: this.recommended.length,
          focusedBranch: "",
          focusedName: "",
          relTypes: this.networkGraph.relTypes,
          rankList: graph.degreeRank(this.networkGraph.nodes, 10).map((n) => ({ id: n.id, label: n.label, kind: n.kind, degree: n.degree, rank: n.rank }))
        });
        this.updateCounts();
        if (this.data.sheet === "manage") this.buildManageData();
        if (this.data.mode === "tree") {
          this.fitView(this.treeGraph.nodes);
        } else if (this.networkGraph.nodes.length > 0) {
          graph.initPositions(this.networkGraph.nodes, this.cssW, this.cssH);
          this.fitView(this.networkGraph.nodes);
          this.simTicks = 0;
          this.startSim();
        } else {
          this.render();
        }
      })
      .catch((error) => { if (!this.unloaded && loadId === this.loadId) { this.setData({ loading: false }); showError(error); } });
  },

  updateCounts() {
    const isTree = this.data.mode === "tree";
    const nodes = isTree ? (this.treeGraph ? this.treeGraph.nodes.length : 0) : (this.networkGraph ? this.networkGraph.nodes.length : 0);
    const edges = isTree ? (this.treeGraph ? this.treeGraph.edges.length : 0) : (this.networkGraph ? this.networkGraph.edges.length : 0);
    const legend = isTree
      ? [
          { key: "self", label: "我", color: "#1f3a57" },
          { key: "category", label: "分类", color: "#2563eb" },
          { key: "recommended", label: "推荐", color: "#9aa7b4" }
        ]
      : [
          { key: "person", label: "人物", color: "#2563eb" },
          { key: "org", label: "单位", color: "#18a88e" },
          { key: "city", label: "城市", color: "#d89134" }
        ];
    this.setData({ nodeCount: nodes, edgeCount: edges, legend });
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.setData({ mode, sheet: "", focusedBranch: "", focusedName: "", searchResults: [] });
    this.selectedBranch = null;
    this.selectedId = null;
    this.selectedEdgeId = null;
    this.focusedBranch = null;
    if (this._branchTimer) { clearTimeout(this._branchTimer); this._branchTimer = null; }
    if (this._searchTimer) { clearTimeout(this._searchTimer); this._searchTimer = null; }
    this._lastTapId = ""; this._lastTapTime = 0;
    this.updateCounts();
    if (mode === "tree") {
      this.fitView(this.treeGraph.nodes);
      this.render();
    } else {
      const first = this.networkGraph && this.networkGraph.nodes[0];
      if (first && typeof first.x !== "number") {
        graph.initPositions(this.networkGraph.nodes, this.cssW, this.cssH);
        this.fitView(this.networkGraph.nodes);
        this.simTicks = 0;
        this.startSim();
      } else {
        this.render();
      }
    }
  },

  // —— 力导向动画（仅关系网）——
  startSim() {
    if (!this.visible || this.unloaded || this.simRunning || this.data.mode !== "network") return;
    this.simRunning = true;
    const epoch = ++this.simEpoch;
    const tick = () => {
      if (epoch !== this.simEpoch) return;
      if (!this.simRunning || this.data.mode !== "network") { this.simRunning = false; return; }
      if (this.frozen) { this.simRunning = false; return; }
      const perFrame = 4;
      let movement = 0;
      for (let i = 0; i < perFrame; i += 1) {
        movement += graph.stepForce(this.networkGraph.nodes, this.networkEdgePairs, { width: this.cssW, height: this.cssH });
        this.simTicks += 1;
      }
      this.render();
      if (this.simTicks < this.simMax && movement > 0.6) this.canvas.requestAnimationFrame(tick);
      else this.simRunning = false;
    };
    this.canvas.requestAnimationFrame(tick);
  },

  // —— 坐标变换 ——
  worldToScreen(x, y) { return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY }; },
  screenToWorld(x, y) { return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale }; },

  fitView(nodes) {
    const list = nodes || (this.data.mode === "tree" ? this.treeGraph.nodes : this.networkGraph.nodes);
    if (!list || list.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    list.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    });
    const pad = 60;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const scale = Math.min((this.cssW - pad * 2) / w, (this.cssH - pad * 2) / h, 2.2);
    this.scale = Math.max(0.2, scale);
    this.offsetX = (this.cssW - w * this.scale) / 2 - minX * this.scale;
    this.offsetY = (this.cssH - h * this.scale) / 2 - minY * this.scale;
  },

  focusNode(id) {
    const node = (this.treeGraph && this.treeGraph.nodeById.get(id)) || (this.networkGraph && this.networkGraph.nodeById.get(id));
    if (!node) return;
    this.offsetX = this.cssW / 2 - node.x * this.scale;
    this.offsetY = this.cssH / 2 - node.y * this.scale;
    this.render();
  },

  // —— 渲染分发 ——
  render() {
    // 抽屉打开时清空画布，避免画布内容叠在抽屉之上（重影/穿透）。
    // 例外：「筛选」「工具」两个面板需要边看图谱边操作，保留画布。
    const sheet = this.data.sheet;
    if (sheet && sheet !== "filter" && sheet !== "tools") {
      if (this.ctx) this.ctx.clearRect(0, 0, this.cssW, this.cssH);
      return;
    }
    if (this.data.mode === "tree") this.renderTree();
    else this.renderNetwork();
  },

  renderNetwork() {
    const ctx = this.ctx;
    if (!ctx || !this.networkGraph) return;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    if (this.networkGraph.nodes.length === 0) return;
    const byId = this.networkGraph.nodeById;
    const showNode = (n) => this.data.filters[n.kind] !== false && (!this.isolation || this.isolation.has(n.id));
    const showEdge = (e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (!s || !t || !showNode(s) || !showNode(t)) return false;
      if (e.kind === "relation" && this.data.relFilter[e.type] === false) return false;
      return true;
    };
    this.networkGraph.edges.forEach((e) => {
      if (!showEdge(e)) return;
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      const ps = this.worldToScreen(s.x, s.y);
      const pt = this.worldToScreen(t.x, t.y);
      const inPath = this.pathEdges && this.pathEdges.has(e.id);
      const dim = this.pathNodes && !inPath;
      ctx.save();
      ctx.globalAlpha = dim ? 0.12 : e.kind === "relation" ? (inPath ? 1 : 0.72) : 0.8;
      if (e.kind === "affiliation") { ctx.strokeStyle = "#c7d0da"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); }
      else { ctx.strokeStyle = inPath ? "#1d4ed8" : relColor(e.type); ctx.lineWidth = inPath ? 3 : (this.selectedEdgeId === e.id ? 3 : 1.6); ctx.setLineDash([]); }
      ctx.beginPath();
      ctx.moveTo(ps.x, ps.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (e.kind === "relation" && !dim && this.scale >= 0.8 && this.networkGraph.edges.length <= 160) {
        ctx.globalAlpha = dim ? 0.12 : 0.9;
        ctx.fillStyle = "#7a8696";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(truncate(e.type, 5), (ps.x + pt.x) / 2, (ps.y + pt.y) / 2 - 3);
      }
      ctx.restore();
    });
    this.networkGraph.nodes.forEach((n) => {
      if (!showNode(n)) return;
      const p = this.worldToScreen(n.x, n.y);
      const r = radiusFor(n);
      const inPath = this.pathNodes && this.pathNodes.has(n.id);
      const dim = this.pathNodes && !inPath;
      const selected = this.selectedId === n.id;
      ctx.save();
      ctx.globalAlpha = dim ? 0.18 : 1;
      if (selected || inPath) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = inPath && !selected ? "#1d4ed8" : "#2563eb";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = graph.KIND_COLORS[n.kind];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const glyph = n.kind === "person" ? firstChar(n.label) : n.kind === "org" ? "单" : "城";
      ctx.fillText(glyph, p.x, p.y);
      ctx.globalAlpha = dim ? 0.25 : 0.92;
      ctx.fillStyle = "#1f3a57";
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(truncate(n.label, 6), p.x, p.y + r + 3);
      ctx.restore();
    });
  },

  renderTree() {
    const ctx = this.ctx;
    if (!ctx || !this.treeGraph) return;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const byId = this.treeGraph.nodeById;
    // 聚焦某分支时，只绘制 self + 该分支子树，其余分支隐藏
    const focusId = this.focusedBranch;
    const visible = focusId ? new Set(graph.collectTreeIds(byId, focusId)) : null;
    if (visible) visible.add("self");
    this.treeGraph.edges.forEach((e) => {
      if (visible && !(visible.has(e.source) && visible.has(e.target))) return;
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (!s || !t) return;
      const ps = this.worldToScreen(s.x, s.y);
      const pt = this.worldToScreen(t.x, t.y);
      const inPath = this.pathEdges && this.pathEdges.has(e.id);
      const dim = this.pathNodes && !inPath;
      const active = this.selectedBranch === e.target;
      ctx.save();
      ctx.globalAlpha = dim ? 0.12 : (active || inPath ? 1 : 0.78);
      ctx.strokeStyle = inPath ? "#1d4ed8" : (e.recommended ? "#9aa7b4" : "#c7d0da");
      ctx.lineWidth = (inPath || active) ? 2.5 : 1.5;
      if (e.recommended) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(ps.x, ps.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });
    this.treeGraph.nodes.forEach((n) => {
      if (n.kind === "contact") return; // 联系人不在画布显示，点分支时在抽屉查看
      if (visible && !visible.has(n.id)) return;
      const p = this.worldToScreen(n.x, n.y);
      const r = treeRadius(n);
      const selected = this.selectedId === n.id || this.selectedBranch === n.id;
      const inPath = this.pathNodes && this.pathNodes.has(n.id);
      const dim = this.pathNodes && !inPath;
      ctx.save();
      ctx.globalAlpha = dim ? 0.18 : 1;
      if (selected || inPath) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = inPath && !selected ? "#1d4ed8" : "#2563eb";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.shadowColor = "rgba(20,45,80,.18)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = n.id === "self" ? "#1f3a57" : n.kind === "contact" ? "#18a88e" : (n.recommended ? "#9aa7b4" : "#2563eb");
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      if (n.recommended && n.kind === "category") {
        ctx.globalAlpha = dim ? 0.18 : 0.9;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = "#9aa7b4";
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (n.id === "self") ctx.fillText("我", p.x, p.y);
      else ctx.fillText(n.recommended ? "+" : firstChar(n.label), p.x, p.y);
      ctx.globalAlpha = dim ? 0.25 : 0.95;
      ctx.fillStyle = "#1f3a57";
      ctx.font = "12px sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(truncate(n.label, 6), p.x, p.y + r + 3);
      ctx.restore();
    });
  },

  // —— 触摸交互 ——
  onTouchStart(e) {
    const touches = e.touches || [];
    if (touches.length >= 2) {
      this._pinching = true;
      this._dragNode = null;
      this._panning = false;
      const [a, b] = touches;
      this._pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      return;
    }
    const t = touches[0];
    const x = t.clientX - this.rectLeft;
    const y = t.clientY - this.rectTop;
    this._touch = { x, y, moved: false, startTime: Date.now() };
    if (this.data.mode === "network") {
      const hit = this.hitNode(x, y);
      if (hit) { this._dragNode = hit; hit.fixed = true; }
      else { this._panning = true; this._panLast = { x, y }; }
    } else {
      this._panning = true;
      this._panLast = { x, y };
    }
  },
  onTouchMove(e) {
    const touches = e.touches || [];
    if (this._pinching) {
      if (touches.length < 2) return;
      const [a, b] = touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const midX = (a.clientX + b.clientX) / 2 - this.rectLeft;
      const midY = (a.clientY + b.clientY) / 2 - this.rectTop;
      if (this._pinchDist > 0) {
        const ratio = dist / this._pinchDist;
        const wx = (midX - this.offsetX) / this.scale;
        const wy = (midY - this.offsetY) / this.scale;
        this.scale = Math.max(0.2, Math.min(2.6, this.scale * ratio));
        this.offsetX = midX - wx * this.scale;
        this.offsetY = midY - wy * this.scale;
      }
      this._pinchDist = dist;
      this.render();
      return;
    }
    if (touches.length === 0) return;
    const t = touches[0];
    const x = t.clientX - this.rectLeft;
    const y = t.clientY - this.rectTop;
    if (this._touch) this._touch.moved = true;
    if (this._dragNode) {
      const w = this.screenToWorld(x, y);
      this._dragNode.x = w.x;
      this._dragNode.y = w.y;
      this.render();
    } else if (this._panning && this._panLast) {
      this.offsetX += x - this._panLast.x;
      this.offsetY += y - this._panLast.y;
      this._panLast = { x, y };
      this.render();
    }
  },
  onTouchEnd(e) {
    if (this._pinching) {
      if ((e.touches || []).length < 2) {
        this._pinching = false;
        this._pinchDist = 0;
        const remain = (e.touches || [])[0];
        if (remain) { this._panLast = { x: remain.clientX - this.rectLeft, y: remain.clientY - this.rectTop }; this._panning = true; }
      }
      return;
    }
    const moved = this._touch && this._touch.moved;
    const duration = this._touch ? Date.now() - this._touch.startTime : 999;
    if (!moved && duration < 300) this.handleTap(this._touch.x, this._touch.y);
    if (this._dragNode) { this._dragNode.fixed = false; this._dragNode = null; this.simTicks = 0; this.startSim(); }
    this._panning = false;
    this._touch = null;
  },

  handleTap(x, y) {
    if (this.data.mode === "tree") return this.handleTapTree(x, y);
    return this.handleTapNetwork(x, y);
  },
  handleTapTree(x, y) {
    const node = this.hitNode(x, y);
    if (!node) { if (this.data.sheet) this.closeSheet(); return; }
    // 「我」：聚焦态下退出聚焦，否则打开我的中心
    if (node.id === "self") {
      if (this.focusedBranch) this.unfocusBranch();
      else this.selectSelf();
      return;
    }
    // 推荐分类：单击提示，双击直接添加为真实分类（与管理面板的「添加」同一条路径）
    if (node.recommended) {
      const now = Date.now();
      if (this._lastTapId === node.id && now - this._lastTapTime < 350) {
        this._lastTapId = ""; this._lastTapTime = 0;
        this.setData({ hint: "" });
        this.addRecommendedCategory({ currentTarget: { dataset: { name: node.name } } });
      } else {
        this._lastTapId = node.id; this._lastTapTime = now;
        this.setData({ hint: "双击该推荐分类可快速添加" });
        if (this.clearHintTimer) clearTimeout(this.clearHintTimer);
        this.clearHintTimer = setTimeout(() => this.setData({ hint: "" }), 1800);
      }
      return;
    }
    // 真实 / 自动分类：单击（延迟以区分双击）打开分支抽屉；双击聚焦该分支（隐藏其余分支）
    if (node.kind === "category") {
      const now = Date.now();
      if (this._lastTapId === node.id && now - this._lastTapTime < 250) {
        this._lastTapId = ""; this._lastTapTime = 0;
        if (this._branchTimer) { clearTimeout(this._branchTimer); this._branchTimer = null; }
        this.focusBranch(node.id);
      } else {
        this._lastTapId = node.id; this._lastTapTime = now;
        if (this._branchTimer) clearTimeout(this._branchTimer);
        this._branchTimer = setTimeout(() => {
          this._branchTimer = null;
          this._lastTapId = ""; this._lastTapTime = 0;
          this.selectBranch(node);
        }, 250);
      }
      return;
    }
    // 兜底：画布上已无联系人节点，但保留处理
    this._lastTapId = ""; this._lastTapTime = 0;
    if (node.kind === "contact") this.selectContact(node);
  },
  handleTapNetwork(x, y) {
    const node = this.hitNode(x, y);
    if (node) {
      if (this.pathMode) { this.pickPathNode(node.id); return; }
      const now = Date.now();
      if (this._lastTapId === node.id && now - this._lastTapTime < 320) { this.focusNode(node.id); this._lastTapTime = 0; }
      else { this.selectNode(node.id); this._lastTapTime = now; this._lastTapId = node.id; }
      return;
    }
    const edge = this.hitEdge(x, y);
    if (edge) { this.selectEdge(edge); return; }
    if (this.data.sheet) this.closeSheet();
  },

  nodesForHit() { return this.data.mode === "tree" ? this.treeGraph.nodes : this.networkGraph.nodes; },
  hitNode(x, y) {
    const nodes = this.nodesForHit();
    if (!nodes) return null;
    let best = null;
    let bestDist = Infinity;
    nodes.forEach((n) => {
      if (this.data.mode === "network") {
        if (this.data.filters[n.kind] === false) return;
        if (this.isolation && !this.isolation.has(n.id)) return;
      }
      const p = this.worldToScreen(n.x, n.y);
      const d = Math.hypot(p.x - x, p.y - y);
      const r = this.data.mode === "tree" ? treeRadius(n) : radiusFor(n);
      if (d < r + 8 && d < bestDist) { best = n; bestDist = d; }
    });
    return best;
  },
  hitEdge(x, y) {
    if (this.data.mode !== "network" || !this.networkGraph) return null;
    const byId = this.networkGraph.nodeById;
    let best = null;
    let bestDist = 8;
    this.networkGraph.edges.forEach((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (!s || !t) return;
      if (this.data.filters[s.kind] === false || this.data.filters[t.kind] === false) return;
      const ps = this.worldToScreen(s.x, s.y);
      const pt = this.worldToScreen(t.x, t.y);
      const d = pointToSegmentDistance(x, y, ps.x, ps.y, pt.x, pt.y);
      if (d < bestDist) { best = e; bestDist = d; }
    });
    return best;
  },

  // —— 标签树：选中 ——
  selectSelf() {
    this.selectedId = "self";
    this.selectedBranch = null;
    this.setData({
      sheet: "self", sheetTitle: "我的中心",
      selected: { type: "self", label: (this.profile && this.profile.nickname) || "自己", contactCount: this.contacts.length, categoryCount: (this.categoryTree || []).length }
    });
    this.render();
  },
  // 聚焦某个分支：仅显示 self + 该分支子树，隐藏其余分支
  focusBranch(id) {
    const node = this.treeGraph && this.treeGraph.nodeById.get(id);
    if (!node) return;
    this.focusedBranch = id;
    if (this._branchTimer) { clearTimeout(this._branchTimer); this._branchTimer = null; }
    this.setData({ focusedBranch: id, focusedName: node.name, searchResults: [] });
    const ids = graph.collectTreeIds(this.treeGraph.nodeById, id);
    ids.push("self");
    const nodes = ids.map((i) => this.treeGraph.nodeById.get(i)).filter(Boolean);
    this.fitView(nodes);
    this.render();
  },
  unfocusBranch() {
    this.focusedBranch = null;
    this.selectedBranch = null;
    this.setData({ focusedBranch: "", focusedName: "" });
    this.fitView(this.treeGraph.nodes);
    this.render();
  },
  selectBranch(node) {
    this.selectedId = node.id;
    this.selectedBranch = node.id;
    const contacts = this.getBranchContacts(node.id);
    const childCategories = (node.children || []).map((cid) => {
      const c = this.treeGraph.nodeById.get(cid);
      return { id: c.id, name: c.name, recommended: !!c.recommended, synthetic: !!c.synthetic, contactCount: this.getBranchContacts(c.id).length };
    });
    this.setData({
      sheet: "branch", sheetTitle: node.name,
      selected: {
        type: "branch", id: node.id, name: node.name, recommended: !!node.recommended, synthetic: !!node.synthetic,
        contacts: contacts.map((c) => ({ id: c.id, name: c.name, org: c.organization || c.city || "" })),
        childCategories
      }
    });
    this.render();
  },
  getBranchContacts(nodeId) {
    if (nodeId === "uncat") {
      return this.contacts.filter((c) => !(c.categoryIds || []).some((cid) => { const n = this.treeGraph.nodeById.get(cid); return n && n.kind === "category"; }));
    }
    const ids = new Set();
    const stack = [nodeId];
    while (stack.length) {
      const id = stack.pop();
      ids.add(id);
      const n = this.treeGraph.nodeById.get(id);
      (n.children || []).forEach((c) => stack.push(c));
    }
    const seen = new Set();
    const out = [];
    this.contacts.forEach((c) => {
      (c.categoryIds || []).forEach((cid) => {
        if (ids.has(cid) && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
      });
    });
    return out;
  },
  selectContact(node) {
    this.selectedId = node.id;
    this.selectedBranch = null;
    const contact = this.contacts.find((c) => c.id === node.ref) || {};
    this.setData({
      sheet: "detail", sheetTitle: "联系人",
      selected: { type: "node", kind: "person", id: node.id, label: node.label, sub: contact.organization || contact.city || "", degree: 0, ref: node.ref, tags: contact.tags || [], organization: contact.organization || "", city: contact.city || "" }
    });
    this.render();
  },

  viewBranchContact(e) {
    const id = e.currentTarget.dataset.id;
    if (id != null) wx.navigateTo({ url: `/pages/contact-detail/index?id=${id}` });
  },
  openChild(e) {
    const id = e.currentTarget.dataset.id;
    const node = this.treeGraph && this.treeGraph.nodeById.get(id);
    if (node) this.selectBranch(node);
  },

  // —— 标签树：分类管理 ——
  async addTopCategory() {
    const name = await promptName("新建顶层分类", "如：公司 / 大学 / 朋友");
    if (!name) return;
    request("/categories", "POST", { name }).then(() => { wx.showToast({ title: "已添加", icon: "success" }); this.refresh(); }).catch(showError);
  },
  async addChildCategory(e) {
    const id = e.currentTarget.dataset.id;
    const name = await promptName("新建子分类", "如：大学 / 高中 / 小学");
    if (!name) return;
    request("/categories", "POST", { name, parentId: id }).then(() => { wx.showToast({ title: "已添加", icon: "success" }); this.refresh(); }).catch(showError);
  },
  async renameCategory(e) {
    const id = e.currentTarget.dataset.id;
    const name = await promptName("重命名分类", "请输入新名称");
    if (!name) return;
    request(`/categories/${id}`, "PATCH", { name }).then(() => { wx.showToast({ title: "已重命名", icon: "success" }); this.refresh(); }).catch(showError);
  },
  deleteCategory(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({ title: "删除分类", content: `删除「${name}」及其子分类，分类下的联系人不会被删除（仅解除归类）。`, success: (res) => {
      if (!res.confirm) return;
      request(`/categories/${id}`, "DELETE").then(() => { wx.showToast({ title: "已删除", icon: "success" }); this.refresh(); }).catch(showError);
    } });
  },
  addContactToCategory(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: id === "uncat" ? "/pages/contact-form/index" : `/pages/contact-form/index?categoryId=${id}` });
  },
  addRecommendedCategory(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    request("/categories", "POST", { name }).then(() => { wx.showToast({ title: "已添加分类", icon: "success" }); this.refresh(); }).catch(showError);
  },
  refresh() { this.dataSig = ""; this.loadAll(); },

  // —— 标签树：分类管理抽屉 ——
  buildManageData() {
    const flat = [];
    const walk = (nodes, depth) => {
      (nodes || []).forEach((node) => {
        flat.push({ id: node.id, name: node.name, indent: depth * 30, contactCount: this.getBranchContacts(node.id).length });
        walk(node.children || [], depth + 1);
      });
    };
    walk(this.categoryTree || [], 0);
    this.setData({ manageCategories: flat, manageRecommended: this.recommended || [], manageDismissed: this.dismissed || [] });
  },
  openManage() {
    this.buildManageData();
    this.setData({ sheet: "manage", sheetTitle: "分类管理" });
    this.render();
  },
  dismissRecommended(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    request("/categories/dismiss", "POST", { name }).then(() => { wx.showToast({ title: "已隐藏", icon: "success" }); this.refresh(); }).catch(showError);
  },
  restoreRecommended(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    request("/categories/restore", "POST", { name }).then(() => { wx.showToast({ title: "已恢复", icon: "success" }); this.refresh(); }).catch(showError);
  },

  // —— 网络：选中详情 ——
  selectNode(id) {
    const node = this.networkGraph.nodeById.get(id);
    if (!node) return;
    this.selectedId = id;
    this.selectedEdgeId = null;
    let detail;
    if (node.kind === "person") {
      const contact = (this.contacts || []).find((c) => c.id === node.ref) || {};
      detail = { type: "node", kind: "person", id, label: node.label, sub: node.sub, degree: node.degree, ref: node.ref, tags: node.tags || [], organization: contact.organization || "", city: contact.city || "" };
    } else {
      const members = (this.contacts || []).filter((c) => (node.kind === "org" ? c.organization === node.label : c.city === node.label)).map((c) => ({ id: `p${c.id}`, label: c.name, org: c.organization || c.city || "" }));
      detail = { type: "node", kind: node.kind, id, label: node.label, sub: node.sub, degree: node.degree, members };
    }
    this.setData({ sheet: "detail", sheetTitle: "节点详情", selected: detail });
    this.render();
  },
  selectEdge(edge) {
    const byId = this.networkGraph.nodeById;
    const s = byId.get(edge.source);
    const t = byId.get(edge.target);
    this.selectedEdgeId = edge.id;
    this.selectedId = null;
    this.setData({ sheet: "detail", sheetTitle: edge.kind === "relation" ? "关系详情" : "归属关系", selected: { type: "edge", id: edge.id, kind: edge.kind, relType: edge.type, note: edge.note, sourceLabel: s ? s.label : "?", targetLabel: t ? t.label : "?", ref: edge.ref } });
    this.render();
  },
  viewContact() {
    const sel = this.data.selected;
    if (sel && sel.kind === "person" && sel.ref != null) wx.navigateTo({ url: `/pages/contact-detail/index?id=${sel.ref}` });
  },
  addRelation() {
    const sel = this.data.selected;
    if (sel && sel.kind === "person" && sel.ref != null) wx.navigateTo({ url: `/pages/relationship-form/index?sourceId=${sel.ref}` });
  },
  centerOn() {
    const sel = this.data.selected;
    if (sel && sel.id) { this.centerId = sel.id; this.focusNode(sel.id); this.closeSheet(); }
  },
  focusMember(e) { const id = e.currentTarget.dataset.id; if (id) this.focusNode(id); },
  deleteRelation() {
    const sel = this.data.selected;
    if (!sel || sel.kind !== "relation" || sel.ref == null) return;
    wx.showModal({ title: "删除关系", content: "删除后无法恢复，是否继续？", success: (res) => {
      if (!res.confirm) return;
      request(`/relationships/${sel.ref}`, "DELETE").then(() => { wx.showToast({ title: "已删除", icon: "success" }); this.dataSig = ""; this.closeSheet(); this.refresh(); }).catch(showError);
    } });
  },

  // —— 搜索（实时结果列表 + 定位）——
  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ keyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    if (keyword.trim()) this._searchTimer = setTimeout(() => this.runSearch(), 250);
    else this.setData({ searchResults: [] });
  },
  clearSearch() { this.setData({ keyword: "", searchResults: [] }); },
  runSearch() {
    const kw = (this.data.keyword || "").trim().toLowerCase();
    if (!kw) { this.setData({ searchResults: [] }); return; }
    const results = [];
    if (this.data.mode === "tree") {
      const catMap = new Map();
      const walk = (nodes) => (nodes || []).forEach((n) => { catMap.set(n.id, n.name); walk(n.children); });
      walk(this.categoryTree);
      catMap.forEach((name, id) => { if (name.toLowerCase().indexOf(kw) >= 0) results.push({ type: "category", id, name, sub: "分类", catId: "" }); });
      (this.contacts || []).forEach((c) => {
        if ((c.name || "").toLowerCase().indexOf(kw) >= 0) {
          const cid = (c.categoryIds || []).find((x) => catMap.has(x)) || "";
          results.push({ type: "contact", id: c.id, name: c.name, sub: c.organization || c.city || "联系人", catId: cid });
        }
      });
    } else {
      (this.networkGraph ? this.networkGraph.nodes : []).forEach((n) => {
        if ((n.label || "").toLowerCase().indexOf(kw) >= 0) results.push({ type: n.kind, id: n.id, name: n.label, sub: n.sub || "", catId: "" });
      });
    }
    this.setData({ searchResults: results.slice(0, 30) });
  },
  search() {
    this.runSearch();
    const results = this.data.searchResults;
    if (results.length === 1) this.locateResult({ currentTarget: { dataset: results[0] } });
  },
  locateResult(e) {
    const d = e.currentTarget.dataset;
    const type = d.type; const id = d.id; const catId = d.catid || d.catId; const name = d.name;
    if (this.data.mode === "tree") {
      if (type === "category") {
        const node = this.treeGraph && this.treeGraph.nodeById.get(id);
        if (node) { this.focusBranch(id); this.selectBranch(node); }
      } else {
        const cid = catId || (this.treeGraph && this.treeGraph.nodeById.has("uncat") ? "uncat" : "");
        if (cid && this.treeGraph && this.treeGraph.nodeById.get(cid)) {
          const node = this.treeGraph.nodeById.get(cid);
          this.focusBranch(cid);
          this.selectBranch(node);
        } else {
          this.selectSelf();
        }
        this.setData({ hint: `已定位：${name}` });
      }
    } else {
      const node = this.networkGraph && this.networkGraph.nodeById.get(id);
      if (node) { this.focusNode(id); this.selectNode(id); }
    }
    this.setData({ searchResults: [] });
  },
  clearHint() { this.setData({ hint: "" }); },

  // —— 抽屉 ——
  openSheet(e) {
    const which = e.currentTarget.dataset.sheet;
    const titles = { detail: "节点详情", filter: "筛选与显隐", rank: "人脉中心度 TOP 10", tools: "图谱工具" };
    if (which === "rank") {
      this.setData({ sheet: "rank", sheetTitle: titles.rank, rankList: graph.degreeRank(this.networkGraph.nodes, 10).map((n) => ({ id: n.id, label: n.label, kind: n.kind, degree: n.degree, rank: n.rank })) });
    } else {
      this.setData({ sheet: which, sheetTitle: titles[which] || "" });
    }
    this.render();
  },
  closeSheet() { this.setData({ sheet: "" }); this.render(); },
  sheetMaskTap() { this.closeSheet(); },

  // —— 筛选 ——
  toggleKind(e) {
    const kind = e.currentTarget.dataset.kind;
    const filters = { ...this.data.filters, [kind]: !this.data.filters[kind] };
    this.setData({ filters });
    this.render();
  },
  toggleRel(e) {
    const type = e.currentTarget.dataset.type;
    const relFilter = { ...this.data.relFilter };
    relFilter[type] = relFilter[type] === false ? true : false;
    this.setData({ relFilter });
    this.render();
  },

  // —— 排行 ——
  rankTap(e) { const id = e.currentTarget.dataset.id; if (id) { this.focusNode(id); this.closeSheet(); } },

  // —— 工具 ——
  fit() { this.fitView(); this.render(); },
  resetView() {
    this.isolation = null; this.pathNodes = null; this.pathEdges = null; this.pathMode = false; this.pathStart = null; this.pathEnd = null;
    this.selectedId = null; this.selectedEdgeId = null; this.centerId = null;
    this.setData({ hint: "" });
    this.fitView(this.networkGraph.nodes);
    this.render();
    this.closeSheet();
  },
  setDegreeN(e) { this.setData({ degreeN: Number(e.currentTarget.dataset.n) }); },
  isolateN() {
    const center = this.selectedId || this.centerId;
    if (!center) { this.setData({ hint: "请先点选一个节点作为中心" }); return; }
    this.isolation = graph.neighborsWithin(this.networkAdjacency, center, this.data.degreeN);
    this.pathNodes = null; this.pathEdges = null; this.pathMode = false;
    this.focusNode(center);
    this.setData({ hint: `已隔离 ${this.data.degreeN} 度内 ${this.isolation.size} 个节点` });
    this.closeSheet();
  },
  clearIsolation() { this.isolation = null; this.setData({ hint: "已清除隔离" }); this.render(); },
  toggleFreeze() { this.frozen = !this.frozen; this.setData({ frozen: this.frozen }); if (!this.frozen && this.networkGraph && this.simTicks < this.simMax) this.startSim(); },
  togglePathMode() {
    this.pathMode = !this.pathMode;
    this.pathStart = null; this.pathEnd = null;
    if (this.pathMode) { this.pathNodes = null; this.pathEdges = null; this.setData({ hint: "路径模式：点选起点节点" }); }
    else this.setData({ hint: "已退出路径模式" });
    this.render();
  },
  pickPathNode(id) {
    if (!this.pathStart) { this.pathStart = id; this.setData({ hint: "已选起点，点选终点节点" }); return; }
    if (!this.pathEnd && id !== this.pathStart) {
      this.pathEnd = id;
      const path = graph.shortestPath(this.networkAdjacency, this.pathStart, this.pathEnd);
      if (!path) { this.setData({ hint: "两点之间不连通" }); this.pathEnd = null; return; }
      this.pathNodes = new Set(path);
      this.pathEdges = new Set();
      for (let i = 0; i < path.length - 1; i += 1) {
        const a = path[i], b = path[i + 1];
        const edge = this.networkGraph.edges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
        if (edge) this.pathEdges.add(edge.id);
      }
      this.setData({ hint: `已找到 ${path.length - 1} 跳路径`, sheet: "detail", sheetTitle: "最短路径", selected: { type: "path", path: path.map((pid) => { const n = this.networkGraph.nodeById.get(pid); return { id: pid, label: n ? n.label : "?", kind: n ? n.kind : "" }; }) } });
      this.render();
    }
  },
  pathNodeTap(e) { const id = e.currentTarget.dataset.id; if (id) this.focusNode(id); },

  // —— 空状态 ——
  addFirst() { wx.navigateTo({ url: "/pages/contact-form/index" }); },
  goContacts() { wx.switchTab({ url: "/pages/contacts/index" }); }
});
