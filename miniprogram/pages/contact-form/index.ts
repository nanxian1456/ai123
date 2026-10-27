import { request, showError } from "../../utils/api";
import duplicates = require("../../utils/duplicates");
import type { LocalCategory } from "../../utils/local-data";
import { splitTags, suggestedTagOptions } from "../../utils/contact-tags";
import { confirmAiTransfer } from "../../utils/consent";
import { countryOption, searchCountries, normalizeProvince, normalizeCity, provinceNames, cityNames, regionOf, type Country } from "../../utils/regions";

const AI_FIELDS = [
  { key: "name", label: "姓名" },
  { key: "organization", label: "单位" },
  { key: "position", label: "职务" },
  { key: "province", label: "省份" },
  { key: "city", label: "城市" },
  { key: "phone", label: "电话" },
  { key: "email", label: "邮箱" },
  { key: "tags", label: "标签" },
  { key: "note", label: "备注" },
];
type ContactField =
  | "name"
  | "organization"
  | "position"
  | "province"
  | "city"
  | "phone"
  | "email"
  | "note";
const CONTACT_FIELDS = AI_FIELDS.filter((item) => item.key !== "tags").map(
  (item) => item.key as ContactField,
);
const MAX_CATEGORIES = 20;
interface CategoryOption {
  id: string;
  label: string;
  selected: boolean;
}
// Depth-first, in tree order; children are labelled with their full path, e.g. "大学 / 南邮".
function flattenCategories(tree: LocalCategory[], prefix = ""): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const node of tree) {
    const label = prefix ? `${prefix} / ${node.name}` : node.name;
    out.push({ id: node.id, label });
    out.push(...flattenCategories(node.children || [], label));
  }
  return out;
}
const previewFields = (data: any) =>
  AI_FIELDS.map(({ key, label }) => {
    const raw = data[key];
    const value = Array.isArray(raw)
      ? raw.join("，")
      : typeof raw === "string"
        ? raw.trim()
        : "";
    return { key, label, value };
  }).filter((item) => item.value);

Page({
  data: {
    entryMode: "manual" as "manual" | "ai" | "code" | "batch",
    countryPickerOpen: false,
    countryKeyword: "",
    countryOptions: [] as Country[],
    recentCountries: [] as Country[],
    countryUnrecognized: false,
    domesticRegion: false,
    manualRegion: false,
    provinceOptions: ["未设置"],
    cityOptions: ["未设置"],
    provinceIndex: 0,
    cityIndex: 0,
    regionChanging: false,
    id: "",
    form: {
      name: "",
      organization: "",
      position: "",
      country: "",
      province: "",
      city: "",
      address: "",
      latitude: null as number | null,
      longitude: null as number | null,
      phone: "",
      email: "",
      note: "",
      tagsText: "",
    },
    aiText: "",
    aiDraft: null as any,
    aiFields: [] as Array<{ key: string; label: string; value: string }>,
    extracting: false,
    saving: false,
    loading: false,
    loadFailed: false,
    importCode: "",
    importing: false,
    suggestedTags: suggestedTagOptions(""),
    availableTags: [] as Array<{ name: string; count: number }>,
    selectedTags: [] as string[],
    // null: the contact never had classifications and none were chosen, so none are sent.
    categoryIds: null as string[] | null,
    categoryOptions: [] as CategoryOption[],
  },
  categoryList: [] as Array<{ id: string; label: string }>,
  categoriesLoaded: false,
  onLoad(query: Record<string, string>) {
    if (query.id) this.setData({ id: query.id });
    const mode = query.mode;
    if (mode === "ai" || (!query.id && (mode === "code" || mode === "batch")))
      this.setData({ entryMode: mode });
    if (!query.id && query.categoryId)
      this.setData({ categoryIds: [query.categoryId] });
    this.refreshRegionChoices();
    this.loadCategories();
    this.loadTags();
    if (query.id) this.loadContact(query.id);
  },
  selectEntryMode(event: any) {
    if (this.data.saving || this.data.loading || this.data.extracting || this.data.importing) return;
    const mode = event.currentTarget.dataset.mode;
    if (!["manual", "ai", "code", "batch"].includes(mode)) return;
    if (this.data.id && (mode === "code" || mode === "batch")) return;
    this.setData({ entryMode: mode });
  },
  async loadCategories() {
    try {
      const result = await request<{ tree?: LocalCategory[] }>("/categories");
      this.categoryList = flattenCategories((result && result.tree) || []);
      // Only a well-formed answer is trusted for pruning deleted classifications.
      this.categoriesLoaded = !!result && Array.isArray(result.tree);
      this.refreshCategoryOptions();
    } catch (error) {
      showError(error);
    }
  },
  // Drops classifications that no longer exist (e.g. the category was deleted in the graph
  // after the form was opened from it), so saving does not fail with "分类数据无效".
  pruneDeletedCategories(): boolean {
    const current = this.data.categoryIds;
    if (!this.categoriesLoaded || !current || !current.length) return false;
    const existing = new Set(this.categoryList.map((item) => item.id));
    const kept = current.filter((id) => existing.has(id));
    if (kept.length === current.length) return false;
    this.setData({ categoryIds: kept });
    wx.showToast({ title: "原分类已被删除，已取消该归类", icon: "none" });
    return true;
  },
  refreshCategoryOptions() {
    this.pruneDeletedCategories();
    const selected = new Set(this.data.categoryIds || []);
    this.setData({
      categoryOptions: this.categoryList.map((item) => ({
        ...item,
        selected: selected.has(item.id),
      })),
    });
  },
  toggleCategory(event: any) {
    if (this.data.loading || this.data.loadFailed || this.data.saving) return;
    const id = event.currentTarget.dataset.id as string;
    const current = this.data.categoryIds || [];
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
    if (next.length > MAX_CATEGORIES)
      return wx.showToast({ title: `最多归入${MAX_CATEGORIES}个分类`, icon: "none" });
    this.setData({ categoryIds: next });
    this.refreshCategoryOptions();
  },
  retryLoad() {
    if (this.data.id && !this.data.loading) this.loadContact(this.data.id);
  },
  async loadTags() {
    try {
      const tags =
        await request<Array<{ name: string; count: number }>>("/tags");
      this.setData({
        availableTags: tags,
        suggestedTags: suggestedTagOptions(this.data.form.tagsText, tags),
      });
    } catch (error) {
      showError(error);
    }
  },
  async loadContact(id: string) {
    this.setData({ id, loading: true, loadFailed: false });
    try {
      const contact = await request<any>(`/contacts/${id}`);
      const tagsText = (contact.tags || []).join("，");
      this.setData({
        id,
        form: {
          name: contact.name || "",
          organization: contact.organization || "",
          position: contact.position || "",
          country: contact.country || "",
          province: contact.province || "",
          city: contact.city || "",
          address: contact.address || "",
          latitude: contact.latitude ?? null,
          longitude: contact.longitude ?? null,
          phone: contact.phone || "",
          email: contact.email || "",
          note: contact.note || "",
          tagsText,
        },
        suggestedTags: suggestedTagOptions(tagsText, this.data.availableTags),
        selectedTags: splitTags(tagsText),
        categoryIds: Array.isArray(contact.categoryIds) ? contact.categoryIds : null,
      });
      this.refreshRegionChoices();
      this.refreshCategoryOptions();
      wx.setNavigationBarTitle({ title: "编辑联系人" });
    } catch (error) {
      this.setData({ loadFailed: true });
      showError(error);
    } finally {
      this.setData({ loading: false });
    }
  },
  regionBusy() {
    return this.data.loading || this.data.loadFailed || this.data.saving || this.data.extracting || this.data.importing || this.data.regionChanging;
  },
  refreshRegionChoices() {
    const place = regionOf(this.data.form);
    const provinceOptions = ["未设置", ...provinceNames()];
    const cityOptions = ["未设置", ...cityNames(place.province)];
    this.setData({
      domesticRegion: place.country === "中国",
      countryUnrecognized: !!this.data.form.country.trim() && !countryOption(this.data.form.country),
      provinceOptions, cityOptions,
      provinceIndex: Math.max(0, provinceOptions.indexOf(normalizeProvince(this.data.form.province))),
      cityIndex: Math.max(0, cityOptions.indexOf(normalizeCity(this.data.form.city))),
    });
  },
  recentCountryKey() {
    const owner = wx.getStorageSync("ai-network-owner-id");
    return owner ? `ai-network-recent-countries:${owner}` : "";
  },
  openCountryPicker() {
    if (this.regionBusy()) return;
    const key = this.recentCountryKey();
    const stored = key ? wx.getStorageSync(key) : [];
    const codes = Array.isArray(stored) ? stored.filter(code => typeof code === "string").slice(0, 6) : [];
    const recentCountries = codes.map(code => countryOption(code)).filter((item): item is Country => !!item);
    this.refreshRegionChoices();
    this.setData({ countryPickerOpen: true, countryKeyword: "", countryOptions: searchCountries(), recentCountries });
  },
  closeCountryPicker() { if (!this.data.regionChanging) this.setData({ countryPickerOpen: false }); },
  toggleManualRegion() { if (!this.regionBusy()) this.setData({ manualRegion: !this.data.manualRegion }); },
  countrySearch(event: any) {
    const countryKeyword = String(event.detail.value || "");
    this.setData({ countryKeyword, countryOptions: searchCountries(countryKeyword) });
  },
  async confirmRegionChange(updates: Record<string, unknown>, needsConfirmation: boolean): Promise<boolean> {
    if (this.regionBusy()) return false;
    const snapshot = JSON.stringify(this.data.form);
    this.setData({ regionChanging: true });
    try {
      if (needsConfirmation) {
        const accepted = await new Promise<boolean>(resolve => wx.showModal({
          title: "确认更换地区",
          content: "更换后将清空下级地区、详细位置和地图坐标，联系人其他资料保留。是否继续？",
          confirmText: "更换", cancelText: "取消",
          success: result => resolve(result.confirm), fail: () => resolve(false),
        }));
        if (!accepted) return false;
      }
      if (snapshot !== JSON.stringify(this.data.form) || this.data.saving || this.data.extracting || this.data.importing) {
        wx.showToast({ title: "资料已变化，请重新选择", icon: "none" });
        return false;
      }
      this.setData(updates);
      this.refreshRegionChoices();
      return true;
    } finally { this.setData({ regionChanging: false }); }
  },
  async selectCountry(event: any) {
    if (this.regionBusy()) return;
    const code = event.currentTarget.dataset.code;
    if (typeof code !== "string") return;
    const option = code ? countryOption(code) : undefined;
    if (code && (!option || option.code !== code)) return;
    const country = option?.name || "";
    const form = this.data.form;
    const hasLocation = !!(form.province || form.city || form.address || form.latitude != null || form.longitude != null);
    const same = country === regionOf(form).country && !(country === "" && hasLocation);
    const updates: Record<string, unknown> = { "form.country": country };
    if (!same) Object.assign(updates, { "form.province": "", "form.city": "", "form.address": "", "form.latitude": null, "form.longitude": null });
    if (!await this.confirmRegionChange(updates, !same && hasLocation)) return;
    this.setData({ countryPickerOpen: false, manualRegion: false });
    const key = this.recentCountryKey();
    if (key && option) {
      try {
        const stored = wx.getStorageSync(key);
        const codes = Array.isArray(stored) ? stored.filter(value => typeof value === "string" && value !== code) : [];
        wx.setStorageSync(key, [code, ...codes].slice(0, 6));
      } catch (_) { /* A preference write must not prevent saving contact data. */ }
    }
  },
  async changeProvince(event: any) {
    if (this.regionBusy()) return;
    const value = this.data.provinceOptions[Number(event.detail.value)];
    if (value === undefined) return;
    const province = value === "未设置" ? "" : value;
    if (province === normalizeProvince(this.data.form.province)) return;
    const form = this.data.form;
    await this.confirmRegionChange({ "form.province": province, "form.city": "", "form.address": "", "form.latitude": null, "form.longitude": null },
      !!(form.city || form.address || form.latitude != null || form.longitude != null));
  },
  async changeCity(event: any) {
    if (this.regionBusy()) return;
    const value = this.data.cityOptions[Number(event.detail.value)];
    if (value === undefined) return;
    const city = value === "未设置" ? "" : value;
    if (city === normalizeCity(this.data.form.city)) return;
    const form = this.data.form;
    await this.confirmRegionChange({ "form.city": city, "form.address": "", "form.latitude": null, "form.longitude": null },
      !!(form.address || form.latitude != null || form.longitude != null));
  },
  input(event: any) {
    if (this.data.loading || this.data.loadFailed) return;
    const field = event.currentTarget.dataset.field;
    const updates: Record<string, any> = {
      [`form.${field}`]: event.detail.value,
    };
    if (field === "tagsText") {
      updates.suggestedTags = suggestedTagOptions(
        event.detail.value,
        this.data.availableTags,
      );
      updates.selectedTags = splitTags(event.detail.value);
    }
    if (["address", "country", "province", "city"].includes(field)) {
      updates["form.latitude"] = null;
      updates["form.longitude"] = null;
    }
    this.setData(updates);
    if (["country", "province", "city"].includes(field)) this.refreshRegionChoices();
  },
  chooseLocation() {
    if (this.data.loading || this.data.loadFailed) return;
    wx.chooseLocation({
      success: (location: any) => {
        const address = [location.name, location.address].filter(Boolean).join("，");
        this.setData({
          "form.address": address,
          "form.latitude": location.latitude,
          "form.longitude": location.longitude,
        });
      },
    });
  },
  removeTag(event: any) {
    if (this.data.loading || this.data.loadFailed) return;
    const tags = splitTags(this.data.form.tagsText).filter(
      (tag) => tag !== event.currentTarget.dataset.tag,
    );
    const tagsText = tags.join("，");
    this.setData({
      "form.tagsText": tagsText,
      selectedTags: tags,
      suggestedTags: suggestedTagOptions(tagsText, this.data.availableTags),
    });
  },
  toggleSuggestedTag(event: any) {
    if (this.data.loading || this.data.loadFailed) return;
    const tag = event.currentTarget.dataset.tag;
    const tags = Array.from(new Set(splitTags(this.data.form.tagsText)));
    const next = tags.includes(tag)
      ? tags.filter((item) => item !== tag)
      : [...tags, tag];
    if (next.length > 10)
      return wx.showToast({ title: "标签最多10个", icon: "none" });
    const tagsText = next.join("，");
    this.setData({
      "form.tagsText": tagsText,
      selectedTags: next,
      suggestedTags: suggestedTagOptions(tagsText, this.data.availableTags),
    });
  },
  importCodeInput(event: any) {
    this.setData({ importCode: event.detail.value.toUpperCase() });
  },
  async importByCode() {
    if (this.data.importing || this.data.loading || this.data.loadFailed)
      return;
    const code = this.data.importCode.trim().toUpperCase();
    if (!/^\d{3}[A-Z]{2}\d{3}$/.test(code))
      return showError(
        new Error("请输入八位导入码：3位数字、2位字母、3位数字"),
      );
    this.setData({ importing: true });
    try {
      const profile = await request<any>(`/users/importable/${code}`);
      const updates: Record<string, string> = {};
      const fields = {
        name: profile.nickname,
        organization: profile.organization,
        position: profile.position,
        city: profile.city,
        note: profile.bio,
      };
      Object.entries(fields).forEach(([field, value]) => {
        if (
          !String(this.data.form[field as ContactField] || "").trim() &&
          typeof value === "string" &&
          value.trim()
        )
          updates[`form.${field}`] = value.trim();
      });
      this.setData(updates);
      this.refreshRegionChoices();
      wx.pageScrollTo({ selector: "#contact-form", duration: 250 });
      wx.showToast({ title: "已填入空白字段", icon: "success" });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ importing: false });
    }
  },
  aiInput(event: any) {
    this.setData({ aiText: event.detail.value, aiDraft: null, aiFields: [] });
  },
  pasteFromClipboard() {
    wx.getClipboardData({
      success: ({ data }) => {
        const text = String(data || "");
        if (!text.trim())
          return wx.showToast({ title: "剪贴板没有文字", icon: "none" });
        this.setData({
          aiText: text.slice(0, 4000),
          aiDraft: null,
          aiFields: [],
        });
        wx.showToast({
          title: text.length > 4000 ? "已粘贴前4000字" : "已粘贴",
          icon: "none",
        });
      },
      fail: () => wx.showToast({ title: "读取剪贴板失败", icon: "none" }),
    });
  },
  clearAiText() {
    this.setData({ aiText: "", aiDraft: null, aiFields: [] });
  },
  openBatch() {
    wx.navigateTo({ url: "/pages/contacts-batch/index" });
  },
  async extract() {
    if (this.data.extracting) return;
    const text = this.data.aiText.trim();
    if (!text) return wx.showToast({ title: "请先粘贴人物介绍", icon: "none" });
    this.setData({ extracting: true, aiDraft: null, aiFields: [] });
    // Separate consent before any text (usually about other people) leaves for DeepSeek.
    if (!(await confirmAiTransfer())) {
      this.setData({ extracting: false });
      return;
    }
    try {
      const result = await request<{ data: Record<string, string | string[]> }>(
        "/ai/extract",
        "POST",
        { text },
      );
      if (this.data.aiText.trim() !== text) return;
      const data = result.data || {};
      const aiFields = previewFields(data);
      if (!aiFields.length)
        return wx.showToast({ title: "未识别到联系人信息", icon: "none" });
      this.setData({ aiDraft: data, aiFields });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ extracting: false });
    }
  },
  applyAiDraft() {
    if (this.data.loading || this.data.loadFailed) return;
    const data = this.data.aiDraft;
    if (!data) return;
    const updates: Record<
      string,
      string | string[] | ReturnType<typeof suggestedTagOptions>
    > = {};
    CONTACT_FIELDS.forEach((field) => {
      const value = data[field];
      if (
        typeof value === "string" &&
        value.trim() &&
        !String(this.data.form[field as ContactField] || "").trim()
      ) {
        updates[`form.${field}`] = value.trim();
      }
    });
    const existingTags = splitTags(this.data.form.tagsText || "");
    const extractedTags = Array.isArray(data.tags)
      ? data.tags.map((tag: string) => tag.trim()).filter(Boolean)
      : [];
    const tags = Array.from(new Set([...existingTags, ...extractedTags])).slice(
      0,
      10,
    );
    if (tags.length > existingTags.length) {
      updates["form.tagsText"] = tags.join("，");
      updates.suggestedTags = suggestedTagOptions(
        tags.join("，"),
        this.data.availableTags,
      );
      updates.selectedTags = tags;
    }
    if (!Object.keys(updates).length)
      return wx.showToast({ title: "已有资料未被覆盖", icon: "none" });
    this.setData(updates);
    this.refreshRegionChoices();
    wx.pageScrollTo({ selector: "#contact-form", duration: 250 });
    wx.showToast({ title: "已填入空白字段", icon: "success" });
  },
  async save() {
    if (this.data.saving || this.data.loading || this.data.loadFailed || this.data.extracting || this.data.importing || this.data.regionChanging) return;
    const form = this.data.form;
    if (!form.name.trim())
      return wx.showToast({ title: "请填写姓名", icon: "none" });
    const tags = Array.from(new Set(splitTags(form.tagsText)));
    if (tags.length > 10 || tags.some((tag) => tag.length > 20))
      return wx.showToast({
        title: "标签最多10个，每个不超过20字",
        icon: "none",
      });
    this.setData({ saving: true });
    if (this.data.categoryIds && this.data.categoryIds.length) {
      try {
        const result = await request<{ tree?: LocalCategory[] }>("/categories");
        if (result && Array.isArray(result.tree)) {
          this.categoryList = flattenCategories(result.tree);
          this.categoriesLoaded = true;
          if (this.pruneDeletedCategories()) this.refreshCategoryOptions();
        }
      } catch (_) {
        /* The save below reports any remaining problem. */
      }
    }
    const payload = {
      ...form,
      name: form.name.trim(),
      tags,
      ...(this.data.categoryIds ? { categoryIds: [...this.data.categoryIds] } : {}),
    };
    delete (payload as { tagsText?: string }).tagsText;
    try {
      const contacts = await request<any[]>("/contacts");
      const matches = duplicates.findPotentialDuplicates(
        contacts,
        payload,
        this.data.id,
      );
      if (matches.length) {
        const confirmed = await new Promise<boolean>((resolve, reject) =>
          wx.showModal({
            title: "可能重复的联系人",
            content: `本机已有 ${matches.map((item) => item.name).join("、")}。仍要保存吗？`,
            confirmText: "仍要保存",
            success: (result) => resolve(result.confirm),
            fail: reject,
          }),
        );
        if (!confirmed) {
          this.setData({ saving: false });
          return;
        }
      }
      await request(
        this.data.id ? `/contacts/${this.data.id}` : "/contacts",
        this.data.id ? "PATCH" : "POST",
        payload,
      );
      wx.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({ saving: false });
      showError(error);
    }
  },
});
