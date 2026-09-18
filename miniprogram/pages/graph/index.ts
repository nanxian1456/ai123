import { request, showError } from "../../utils/api";
interface Node { id: number; name: string; organization: string; isCenter: boolean; initial?: string; }
interface Edge { id: number; sourceId: number; targetId: number; type: string; }
Page({
  data: { nodes: [] as Node[], edges: [] as Edge[], center: null as Node | null, leftNode: null as Node | null, rightNode: null as Node | null },
  onLoad(query: Record<string, string>) { if (query.id) this.load(query.id); },
  async load(id: string) { try { const graph = await request<{ nodes: Node[]; edges: Edge[] }>(`/graphs/contacts/${id}`); const nodes = graph.nodes.map(node => ({ ...node, initial: node.name.charAt(0) })); const related = nodes.filter(node => !node.isCenter); this.setData({ nodes, edges: graph.edges, center: nodes.find(node => node.isCenter) || null, leftNode: related[0] || null, rightNode: related[1] || null }); } catch (error) { showError(error); } },
  contact(event: any) { const id = event.currentTarget.dataset.id; wx.redirectTo({ url: `/pages/contact-detail/index?id=${id}` }); }
});
