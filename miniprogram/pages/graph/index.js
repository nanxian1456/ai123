const { request, showError } = require("../../utils/api");
const POSITIONS = ["top", "right", "bottom", "left"];

Page({
  data: { center: null, related: [], edges: [] },
  onLoad(query) { if (query.id) this.load(query.id); },
  load(id) { request(`/graphs/contacts/${id}`).then((graph) => { const nodes = (graph.nodes || []).map((node) => ({ ...node, initial: node.name ? node.name.charAt(0) : "?" })); const center = nodes.find((node) => node.isCenter) || null; const related = nodes.filter((node) => !node.isCenter).slice(0, 4).map((node, index) => ({ ...node, position: POSITIONS[index], relationship: (graph.edges || []).find((edge) => edge.sourceId === node.id || edge.targetId === node.id)?.type || "关联" })); this.setData({ center, related, edges: graph.edges || [] }); }).catch(showError); },
  contact(event) { wx.redirectTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); }
});
