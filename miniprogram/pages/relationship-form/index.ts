import { request, showError } from "../../utils/api";
import { contactMatchesKeyword } from "../../utils/contact-search";

const TYPES = ["合作", "指导", "导师", "同事", "同学", "客户", "朋友"];
// At most this many matches are rendered; typing more narrows the list.
const RESULT_LIMIT = 50;
const currentOwner = () => String(wx.getStorageSync("ai-network-owner-id") || "");
interface Candidate { id: number; name: string; meta: string; contact: any; }
const metaOf = (contact: any) =>
  [contact.organization, contact.position, contact.city].filter((value: any) => typeof value === "string" && value.trim()).join(" · ");

// Opened with ?sourceId= to add a relationship, or with ?sourceId=&id= to edit one from that person's side.
Page({
  data: {
    saving: false,
    loading: true,
    loadError: "",
    editing: false,
    relationshipId: 0,
    sourceId: 0,
    source: null as any,
    keyword: "",
    results: [] as { id: number; name: string; meta: string }[],
    moreCount: 0,
    candidateCount: 0,
    targetId: 0,
    targetName: "",
    targetMeta: "",
    types: TYPES.slice(),
    typeIndex: 0,
    typeName: TYPES[0],
    note: "",
  },
  candidates: [] as Candidate[],
  ownerId: "",
  active: true,
  unloaded: false,
  version: 0,
  query: {} as Record<string, string>,
  contextValid(version?: number): boolean {
    if (!this.active || this.unloaded || (version !== undefined && version !== this.version)) return false;
    if (this.ownerId && currentOwner() === this.ownerId) return true;
    this.version++;
    this.candidates = [];
    this.setData({ loading: false, saving: false, source: null, results: [], candidateCount: 0, moreCount: 0,
      targetId: 0, targetName: "", targetMeta: "", note: "", keyword: "", types: TYPES.slice(), typeIndex: 0, typeName: TYPES[0],
      loadError: "账号已切换或登录状态已变化，请重新打开关系页" });
    return false;
  },
  onShow(): void {
    const returning = !this.active;
    this.active = true;
    if (!this.ownerId || !this.contextValid()) return;
    if (returning && this.data.loading) void this.onLoad(this.query);
  },
  onHide() { this.active = false; this.version++; if (this.data.saving) this.setData({ saving: false }); },
  onUnload() { this.active = false; this.unloaded = true; this.version++; },
  async onLoad(query: Record<string, string>): Promise<void> {
    if (!query.sourceId) {
      wx.navigateBack();
      return;
    }
    const sourceId = Number(query.sourceId);
    const relationshipId = Number(query.id || 0);
    this.query = { ...query };
    this.ownerId = currentOwner();
    this.active = true;
    const version = ++this.version;
    if (!this.contextValid(version)) return;
    if (relationshipId) wx.setNavigationBarTitle({ title: "编辑关系" });
    this.setData({ sourceId, relationshipId, editing: !!relationshipId, loading: true, loadError: "" });
    try {
      const contacts = await request<any[]>("/contacts");
      if (!this.contextValid(version)) return;
      this.candidates = contacts.filter(contact => contact.id !== sourceId)
        .map(contact => ({ id: contact.id, name: contact.name, meta: metaOf(contact), contact }));
      this.setData({ source: contacts.find(contact => contact.id === sourceId) || null, candidateCount: this.candidates.length });
      if (relationshipId) {
        // The relationship as this person sees it, so the other person and the label read correctly.
        const views = await request<any[]>(`/contacts/${sourceId}/relationships`);
        if (!this.contextValid(version)) return;
        const view = views.find(item => item.id === relationshipId);
        if (!view) throw new Error("关系不存在或已被删除");
        const types = TYPES.includes(view.label) ? TYPES.slice() : [...TYPES, view.label];
        const typeIndex = types.indexOf(view.label);
        this.setData({ types, typeIndex, typeName: types[typeIndex], note: view.note || "" });
        this.selectTarget(view.other.id);
      }
      this.filterCandidates("");
      this.setData({ loading: false });
    } catch (error) {
      if (!this.contextValid(version)) return;
      this.setData({ loading: false, loadError: error instanceof Error ? error.message : "关系资料读取失败" });
      showError(error);
    }
  },
  filterCandidates(keyword: string) {
    const matches = this.candidates.filter(item => contactMatchesKeyword(item.contact, keyword));
    this.setData({
      results: matches.slice(0, RESULT_LIMIT).map(({ id, name, meta }) => ({ id, name, meta })),
      moreCount: Math.max(0, matches.length - RESULT_LIMIT),
    });
  },
  onKeyword(event: any) {
    if (!this.contextValid()) return;
    const keyword = event.detail.value || "";
    this.setData({ keyword });
    this.filterCandidates(keyword);
  },
  selectTarget(id: number) {
    const candidate = this.candidates.find(item => item.id === id);
    if (!candidate) return;
    this.setData({ targetId: candidate.id, targetName: candidate.name, targetMeta: candidate.meta });
  },
  chooseTarget(event: any) {
    if (!this.contextValid() || this.data.saving) return;
    this.selectTarget(Number(event.currentTarget.dataset.id));
  },
  clearTarget() {
    if (!this.contextValid() || this.data.saving) return;
    this.setData({ targetId: 0, targetName: "", targetMeta: "" });
  },
  typeChange(event: any) {
    if (!this.contextValid()) return;
    const typeIndex = Number(event.detail.value);
    this.setData({ typeIndex, typeName: this.data.types[typeIndex] });
  },
  noteInput(event: any) {
    if (!this.contextValid()) return;
    this.setData({ note: event.detail.value });
  },
  async save() {
    if (!this.contextValid()) return;
    if (this.data.saving || this.data.loading || this.data.loadError) return;
    if (!this.data.targetId)
      return wx.showToast({ title: this.data.candidateCount ? "请先选择关联人物" : "请先新增另一位联系人", icon: "none" });
    this.setData({ saving: true });
    const version = this.version;
    const body = {
      sourceId: this.data.sourceId,
      targetId: this.data.targetId,
      type: this.data.types[this.data.typeIndex],
      note: this.data.note,
    };
    try {
      if (this.data.editing) await request(`/relationships/${this.data.relationshipId}`, "PATCH", body);
      else await request("/relationships", "POST", body);
      if (!this.contextValid(version)) return;
      wx.showToast({ title: this.data.editing ? "关系已更新" : "关系已建立", icon: "success" });
      setTimeout(() => { if (this.contextValid(version)) wx.navigateBack(); }, 400);
    } catch (error) {
      if (!this.contextValid(version)) return;
      this.setData({ saving: false });
      showError(error);
    }
  },
});
