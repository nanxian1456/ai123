const { request, showError } = require("../../utils/api");
const POSITIONS = ["top", "right", "bottom", "left"];

Page({
  data: { contacts: [], selectedIndex: 0, center: null, related: [], edges: [], loading: true },
  onLoad() { this.loadContacts(); },
  loadContacts() {
    request("/contacts").then((contacts) => {
      this.setData({ contacts, loading: false });
      if (contacts.length) this.loadGraph(contacts[0].id);
    }).catch((error) => { this.setData({ loading: false }); showError(error); });
  },
  selectContact(event) {
    const selectedIndex = Number(event.detail.value);
    this.setData({ selectedIndex });
    this.loadGraph(this.data.contacts[selectedIndex].id);
  },
  loadGraph(id) {
    request(`/graphs/contacts/${id}`).then((graph) => {
      const nodes = (graph.nodes || []).map((node) => ({ ...node, initial: node.name ? node.name.charAt(0) : "?" }));
      const related = nodes.filter((node) => !node.isCenter).slice(0, 4).map((node, index) => ({ ...node, position: POSITIONS[index], relationship: (graph.edges || []).find((edge) => edge.sourceId === node.id || edge.targetId === node.id)?.type || "关联" }));
      this.setData({ center: nodes.find((node) => node.isCenter) || null, related, edges: graph.edges || [] });
    }).catch(showError);
  },
  openContact(event) { wx.navigateTo({ url: `/pages/contact-detail/index?id=${event.currentTarget.dataset.id}` }); },
  addRelationship() { if (this.data.center) wx.navigateTo({ url: `/pages/relationship-form/index?sourceId=${this.data.center.id}` }); },
  addContact() { wx.navigateTo({ url: "/pages/contact-form/index" }); }
});
