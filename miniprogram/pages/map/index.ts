import { request, showError } from "../../utils/api";
import { contactMatchesKeyword } from "../../utils/contact-search";
import { regionPoint, type Point } from "../../utils/region-points";
import local = require("../../utils/local-data");
import { createGlobe, countryCenter, type Globe } from "../../utils/globe";
const world = require("../../assets/data/world.js");
const jiangsuGeo = require("../../assets/data/jiangsu.js");
const { createScopedThreejs } = require("threejs-miniprogram");

type Level = "country" | "province" | "city";
interface RegionSample { id: number; name: string; initial: string; color: string; }
interface Region {
  name: string;
  label: string;
  pickerLabel: string;
  count: number;
  percent: number;
  sample: RegionSample[];
}
interface PlaceHit { level: Level; country: string; province: string; city: string; count: number; key: string; label: string; }
interface ContactHit { id: number; name: string; organization: string; country: string; province: string; city: string; place: string; }
const placeLabel = (parts: string[]) => parts.filter(Boolean).join(" › ") || "未设置地区";
let searchId = 0;

// Coordinates the backend found for places missing from the offline table, kept so a revisit needs no network.
const GEO_CACHE_KEY = "ai-network-geo-cache-v1";
const GEO_CACHE_LIMIT = 300;
const geoKey = (country: string, province: string, city: string) => JSON.stringify([country, province, city]);
function readGeoCache(): Record<string, [number, number]> {
  try { const value = wx.getStorageSync(GEO_CACHE_KEY); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  catch (_) { return {}; }
}
function rememberPoints(entries: [string, Point][]) {
  if (!entries.length) return;
  try {
    const cache = readGeoCache();
    entries.forEach(([key, point]) => { delete cache[key]; cache[key] = [point.latitude, point.longitude]; });
    const keys = Object.keys(cache);
    keys.slice(0, Math.max(0, keys.length - GEO_CACHE_LIMIT)).forEach(key => delete cache[key]);
    wx.setStorageSync(GEO_CACHE_KEY, cache);
  } catch (_) { /* The cache is optional. */ }
}
// Offline table first, then the backend's earlier answers.
function knownPoint(country: string, province: string, city: string, cache: Record<string, [number, number]>): Point | null {
  const offline = regionPoint({ country, province, city });
  if (offline) return offline;
  // A country abroad centres on its globe outline.
  const outline = !province && !city && country ? countryCenter(world, country) : null;
  if (outline) return { latitude: outline[1], longitude: outline[0] };
  const cached = cache[geoKey(country, province, city)];
  return Array.isArray(cached) && cached.every(Number.isFinite) ? { latitude: cached[0], longitude: cached[1] } : null;
}
// Which local data the page last showed; returning to the tab reloads only when it changed.
function dataVersion(): string {
  try { const owner = wx.getStorageSync("ai-network-owner-id"); return `${owner}:${local.changedAt(owner)}`; }
  catch (_) { return ""; }
}
interface CityContact {
  id: number;
  name: string;
  organization: string;
  position: string;
  tags: string[];
  initial: string;
  color: string;
  approximate: boolean;
}
// A contact's own saved position; without one the map can only estimate it near the city centre.
const hasPosition = (item: { latitude?: number | null; longitude?: number | null }) =>
  typeof item.latitude === "number" && typeof item.longitude === "number" && Number.isFinite(item.latitude) && Number.isFinite(item.longitude) &&
  Math.abs(item.latitude) <= 90 && Math.abs(item.longitude) <= 180;
const cut = (value: unknown, limit: number) => { const text = typeof value === "string" ? value : ""; return text.length > limit ? `${text.slice(0, limit)}…` : text; };
// Only the fields a list row shows go through setData (1MB per call).
function cityRow(item: { id: number; name: string; organization?: string; position?: string; tags?: string[]; initial?: string; latitude?: number | null; longitude?: number | null }): CityContact {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  return { id: item.id, name: cut(item.name, 30), organization: cut(item.organization, 40), position: cut(item.position, 30),
    tags: tags.slice(0, 3).map(tag => cut(tag, 12)), initial: item.initial || (item.name ? item.name.charAt(0) : "?"), color: avatarColor(item.name || ""), approximate: !hasPosition(item) };
}

const missingLabel: Record<Level, string> = { country: "未设置国家", province: "未设置省份", city: "未设置城市" };
const LEVEL_TITLE: Record<Level, string> = { country: "国家 / 地区", province: "省份 / 州", city: "城市" };
const PALETTE = ["#2563eb", "#16a889", "#e6a23c", "#f56c6c", "#8e44ad", "#2c3e50", "#3498db", "#1abc9c"];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

let loadId = 0;
// The 3D globe, created once the canvas is ready (see utils/globe.ts).
let globe: Globe | null = null;

function isJiangsu(name: string) { return ["江苏", "江苏省", "Jiangsu"].includes(name); }

function buildJiangsuPolygons() {
  const coordinates = jiangsuGeo.features[0].geometry.coordinates as number[][][][];
  return coordinates.map((polygon: number[][][]) => {
    const ring = polygon[0];
    const stride = Math.max(1, Math.ceil(ring.length / 320));
    const points = ring.filter((_: number[], index: number) => index % stride === 0 || index === ring.length - 1)
      .map((point: number[]) => ({ longitude: point[0], latitude: point[1] }));
    if (points.length && (points[0].longitude !== points[points.length - 1].longitude || points[0].latitude !== points[points.length - 1].latitude)) points.push(points[0]);
    return { points, strokeWidth: 3, strokeColor: "#2563EB", fillColor: "#2563EB0D", zIndex: 2 };
  });
}

function contactOffset(index: number) {
  const golden = 137.508 * (Math.PI / 180);
  const angle = index * golden;
  const ring = 1 + Math.floor(index / 8);
  const radius = 0.0018 * ring;
  return { lat: radius * Math.cos(angle), lng: radius * Math.sin(angle) };
}

Page({
  data: {
    level: "country" as Level,
    country: "",
    province: "",
    city: "",
    citySelected: false,
    regions: [] as Region[],
    filteredRegions: [] as Region[],
    total: 0,
    loading: false,
    error: "",
    keyword: "",
    center: null as null | { latitude: number; longitude: number },
    markers: [] as any[],
    includePoints: [] as any[],
    mapScale: 5,
    mapError: "",
    coordinateLoading: false,
    mapWaiting: false,
    mapSlow: false,
    mapLoadId: 0,
    globeError: "",
    globeReady: false,
    provincePolygons: [] as any[],
    cityContactCount: 0,
    approximateCount: 0,
    filteredContacts: [] as CityContact[],
    globalRegions: [] as PlaceHit[],
    globalContacts: [] as ContactHit[],
    levelTitle: LEVEL_TITLE.country
  },

  onReady() {
    wx.createSelectorQuery().select("#globe-canvas").fields({ node: true, size: true }).exec((result: any[]) => {
      if (!result[0]?.node || !result[0].width || !result[0].height) { this.setData({ globeError: "当前设备无法显示地球" }); return; }
      try {
        const canvas = result[0].node;
        // wx.getSystemInfoSync is deprecated; getWindowInfo exists from base library 2.20.1.
        const pixelRatio = Math.min(2, (typeof wx.getWindowInfo === "function" ? wx.getWindowInfo().pixelRatio : 0) || 2);
        globe = createGlobe({
          THREE: createScopedThreejs(canvas), canvas, world, width: result[0].width, height: result[0].height, pixelRatio,
          paused: this.data.level !== "country",
          schedule: callback => setTimeout(callback, 0),
          onFirstFrame: () => this.setData({ globeReady: true }),
          onError: message => this.setData({ globeError: message })
        });
        globe.setRegions(this.data.level === "country" ? this.data.regions : []);
      } catch (error) {
        globe = null;
        console.error("3D globe initialization failed", error);
        this.setData({ globeError: "3D 地球初始化失败，请重新进入地图" });
      }
    });
  },

  // Switching tabs keeps the drill-down, search and map as they were unless the contacts changed.
  loadedVersion: "",
  onShow(): void {
    const version = dataVersion();
    if (version && version === this.loadedVersion) {
      globe?.setPaused(this.data.level !== "country");
      return;
    }
    this.load();
  },

  mapTimer: null as ReturnType<typeof setTimeout> | null,
  // Every marker of the current load; data.markers holds only those matching the search.
  allMarkers: [] as any[],
  // Full contacts of the selected city (page instance only; filtering searches the full text).
  cityContactList: [] as { id: number; name: string; organization: string; position: string; tags: string[]; initial: string; latitude?: number | null; longitude?: number | null }[],
  stopMapWait() {
    if (this.mapTimer !== null) clearTimeout(this.mapTimer);
    this.mapTimer = null;
    this.setData({ mapWaiting: false, mapSlow: false, mapLoadId: 0 });
  },
  waitForMap(current: number) {
    this.setData({ mapWaiting: true, mapSlow: false, mapLoadId: current });
    this.mapTimer = setTimeout(() => {
      if (current !== loadId || this.data.mapLoadId !== current || !this.data.mapWaiting) return;
      this.setData({ mapWaiting: false, mapSlow: true });
      this.mapTimer = null;
    }, 8000);
  },
  // Contacts close together merge into one "N 人" bubble that zooms in when tapped (base library 2.21.0+).
  clusterLoadId: 0,
  enableClusters() {
    if (!this.data.citySelected || this.clusterLoadId === loadId) return;
    this.clusterLoadId = loadId;
    try {
      const context: any = wx.createMapContext("region-map", this);
      if (context && typeof context.initMarkerCluster === "function") context.initMarkerCluster({ enableDefaultStyle: true, zoomOnClick: true, gridSize: 60 });
    } catch (_) { /* Older WeChat versions show every marker separately. */ }
  },
  onMapUpdated(event: any) {
    if (Number(event.currentTarget.dataset.loadId) !== loadId || this.data.mapLoadId !== loadId) return;
    this.enableClusters();
    if (this.mapTimer !== null) clearTimeout(this.mapTimer);
    this.mapTimer = null;
    this.setData({ mapWaiting: false, mapSlow: false });
  },
  onMapError(event: any) {
    if (Number(event.currentTarget.dataset.loadId) !== loadId || this.data.mapLoadId !== loadId) return;
    this.stopMapWait();
    this.setData({ mapError: "地图组件加载失败，请检查网络后重新加载；下方联系人列表仍可使用" });
  },
  retryMap() { if (!this.data.coordinateLoading && !this.data.loading) return this.load(); },

  onHide() {
    loadId++;
    searchId++;
    this.stopMapWait();
    globe?.setPaused(true);
  },

  onUnload() {
    loadId++;
    searchId++;
    this.stopMapWait();
    globe?.dispose();
    globe = null;
  },

  async load() {
    const { level, country, province, city, citySelected } = this.data;
    const current = ++loadId;
    this.loadedVersion = "";
    const version = dataVersion();
    const pending = this.takePendingKeyword();
    // A reload of the same place keeps what was typed; navigating clears the keyword beforehand.
    const keyword = pending || this.data.keyword;
    globe?.setPaused(level !== "country");
    this.stopMapWait();
    this.cityContactList = [];
    this.allMarkers = [];
    const initialSearchId = ++searchId;
    this.setData({
      loading: true, error: "", regions: [], filteredRegions: [], total: 0,
      coordinateLoading: level !== "country",
      center: null, markers: [], includePoints: [], mapError: "",
      cityContactCount: 0, approximateCount: 0, filteredContacts: [], keyword, globalRegions: [], globalContacts: [], levelTitle: citySelected ? "联系人" : LEVEL_TITLE[level],
      provincePolygons: level === "city" && !citySelected && isJiangsu(province) ? buildJiangsuPolygons() : []
    });
    try {
      const items = await request<{ name: string; count: number; sample?: { id: number; name: string; initial: string }[] }[]>(`/maps/regions?level=${level}&country=${encodeURIComponent(country)}&province=${encodeURIComponent(province)}&sample=true`);
      if (current !== loadId) return;
      const total = citySelected ? items.find(item => item.name === city)?.count || 0 : items.reduce((sum, item) => sum + item.count, 0);
      const max = Math.max(1, ...items.map(item => item.count));
      const regions = items.map(item => ({
        ...item,
        label: item.name || missingLabel[level],
        pickerLabel: `${item.name || missingLabel[level]} · ${item.count}人`,
        percent: Math.round(item.count / max * 100),
        sample: (item.sample || []).map(s => ({ ...s, color: avatarColor(s.name) }))
      }));
      this.setData({ regions, total, loading: false });
      // A keyword typed while loading must still apply to the loaded list.
      this.filter(this.data.keyword);
      if (level === "country") globe?.setRegions(items);
      else {
        const requiresProvince = country === "中国" || country.toLowerCase() === "china";
        if (!country || level === "city" && requiresProvince && !province || citySelected && !city) {
          this.setData({ mapError: "当前地区未设置，无法定位" });
        } else {
          await this.loadLocations(current, level, country, province, citySelected ? city : "");
        }
        if (level === "city" && citySelected) await this.loadCityContacts(current, country, province);
      }
      if (current !== loadId) return;
      if (!pending && this.data.keyword.trim() && searchId === initialSearchId) this.searchAll(this.data.keyword);
      this.loadedVersion = version;
    } catch (error) {
      if (current !== loadId) return;
      this.setData({ loading: false, error: "地区数据加载失败" });
      showError(error);
    } finally {
      if (current === loadId) {
        this.setData({ coordinateLoading: false });
        if (level !== "country" && this.data.center && this.data.includePoints.length) this.waitForMap(current);
      }
    }
  },

  async loadLocations(current: number, level: Level, country: string, province: string, city: string) {
    const regions = city ? [] : this.data.regions.filter(item => item.name.trim());
    // The place shown at this level, and where each listed region lies within it.
    const centerPath = { country, province: level === "province" ? "" : province, city };
    const regionPath = (name: string) => level === "province" ? { country, province: name, city: "" } : { country, province, city: name };
    const cache = readGeoCache();
    let center = knownPoint(centerPath.country, centerPath.province, centerPath.city, cache);
    const points = new Map<string, Point>();
    regions.forEach(item => {
      const path = regionPath(item.name);
      const point = knownPoint(path.country, path.province, path.city, cache);
      if (point) points.set(item.name, point);
    });
    let lookupError = "";
    const missing = regions.filter(item => !points.has(item.name)).map(item => item.name);
    if (!center || missing.length) {
      try {
        const found: [string, Point][] = [];
        const batches: string[][] = [];
        for (let index = 0; index < missing.length; index += 30) batches.push(missing.slice(index, index + 30));
        if (!batches.length) batches.push([]);
        for (const names of batches) {
          const result = await request<{ center: Point; markers: { name: string; latitude: number; longitude: number }[] }>(
            "/maps/locations", "POST", { level, country, province, city, regions: names });
          if (current !== loadId) return;
          if (!center && result.center && Number.isFinite(result.center.latitude) && Number.isFinite(result.center.longitude)) {
            center = { latitude: result.center.latitude, longitude: result.center.longitude };
            found.push([geoKey(centerPath.country, centerPath.province, centerPath.city), center]);
          }
          result.markers.forEach(item => {
            if (!names.includes(item.name) || !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return;
            const point = { latitude: item.latitude, longitude: item.longitude };
            points.set(item.name, point);
            const path = regionPath(item.name);
            found.push([geoKey(path.country, path.province, path.city), point]);
          });
        }
        rememberPoints(found);
      } catch (error) {
        if (current !== loadId) return;
        lookupError = error instanceof Error ? error.message : "地图定位暂不可用";
      }
    }
    if (current !== loadId) return;
    // Names, membership and counts come from this load's local snapshot; only coordinates are looked up.
    const markers = regions.filter(item => points.has(item.name)).map((item, id) => ({
      id,
      latitude: points.get(item.name)!.latitude,
      longitude: points.get(item.name)!.longitude,
      iconPath: "/assets/images/map-marker.png",
      width: 28,
      height: 28,
      anchor: { x: 0.5, y: 1 },
      title: `${item.name} ${item.count}人`,
      name: item.name,
      label: { content: `${item.name} ${item.count}人`, color: "#17324e", fontSize: 11, bgColor: "#ffffff", borderRadius: 4, padding: 4, anchorX: 0, anchorY: -32 }
    }));
    if (!center && markers.length) center = { latitude: markers[0].latitude, longitude: markers[0].longitude };
    const includePoints = markers.map(m => ({ latitude: m.latitude, longitude: m.longitude }));
    if (center) includePoints.push({ latitude: center.latitude, longitude: center.longitude });
    if (level === "city" && !this.data.citySelected && isJiangsu(province) && this.data.provincePolygons.length) {
      const outline = this.data.provincePolygons.flatMap((polygon: any) => polygon.points);
      const longitudes = outline.map((point: any) => point.longitude);
      const latitudes = outline.map((point: any) => point.latitude);
      const west = Math.min(...longitudes); const east = Math.max(...longitudes);
      const south = Math.min(...latitudes); const north = Math.max(...latitudes);
      includePoints.push({ latitude: south, longitude: west }, { latitude: north, longitude: east });
    }
    const mapScale = level === "province" || level === "city" && !this.data.citySelected && isJiangsu(province) ? 6 : 9;
    const unresolved = regions.length - markers.length;
    const mapError = !center ? (lookupError || "当前地区暂无可显示的位置")
      : unresolved ? `${unresolved} 个地区暂未定位，列表人数仍按本机联系人统计` : "";
    this.setData({ center, includePoints: center ? includePoints : [], mapScale, mapError });
    this.allMarkers = markers;
    this.filter(this.data.keyword);
  },

  async loadCityContacts(current: number, country: string, province: string) {
    try {
      const items = await request<{ id: number; name: string; organization: string; position: string; tags: string[]; initial: string; latitude?: number | null; longitude?: number | null }[]>(`/contacts/directory?country=${encodeURIComponent(country)}&province=${encodeURIComponent(province)}&city=${encodeURIComponent(this.data.city)}`);
      if (current !== loadId) return;
      this.cityContactList = items.map(item => ({ ...item, organization: item.organization || "", position: item.position || "", tags: Array.isArray(item.tags) ? item.tags : [] }));
      const contacts = this.cityContactList;
      const cityCenter = this.data.center;
      const hasLocation = hasPosition;
      const located = items.find(hasLocation);
      const center = cityCenter || (located ? { latitude: located.latitude!, longitude: located.longitude! } : null);
      let markers: any[] = [];
      if (center) {
        markers = contacts.filter(item => cityCenter || hasLocation(item)).map((item, index) => {
          const offset = contactOffset(index);
          const estimated = !hasLocation(item);
          return {
            id: Number(item.id),
            latitude: item.latitude ?? center.latitude + offset.lat,
            longitude: item.longitude ?? center.longitude + offset.lng,
            iconPath: "/assets/images/map-marker.png",
            width: 26,
            height: 26,
            anchor: { x: 0.5, y: 1 },
            title: item.name,
            name: item.name,
            contactId: item.id,
            joinCluster: true,
            // Estimated positions are drawn faded so they are not mistaken for a saved address.
            alpha: estimated ? 0.5 : 1,
            label: { content: estimated ? `${item.name}（估）` : item.name, color: estimated ? "#7a8794" : "#17324e", fontSize: 10, bgColor: "#ffffff", borderRadius: 3, padding: 3, anchorX: 0, anchorY: -28 }
          };
        });
      }
      const includePoints = center ? [{ latitude: center.latitude, longitude: center.longitude }, ...markers.map(m => ({ latitude: m.latitude, longitude: m.longitude }))] : [];
      this.setData({ center, cityContactCount: contacts.length, approximateCount: contacts.filter(item => !hasLocation(item)).length, includePoints, mapScale: 11 });
      this.allMarkers = markers;
      this.filter(this.data.keyword);
    } catch (error) {
      if (current === loadId) this.setData({ mapError: error instanceof Error ? error.message : "联系人定位暂不可用" });
    }
  },

  onKeyword(event: any) {
    const keyword = event.detail.value || "";
    this.setData({ keyword });
    this.filter(keyword);
    this.searchAll(keyword);
  },

  // Set before a jump so the destination opens already filtered (e.g. to the contact that was tapped).
  pendingKeyword: "",
  takePendingKeyword() { const keyword = this.pendingKeyword; this.pendingKeyword = ""; return keyword; },

  // Places at every level and contacts anywhere; what the current list already shows is left out.
  async searchAll(keyword: string) {
    const current = ++searchId;
    if (!keyword.trim()) { this.setData({ globalRegions: [], globalContacts: [] }); return; }
    try {
      const result = await request<{ regions: Omit<PlaceHit, "key" | "label">[]; contacts: Omit<ContactHit, "place">[] }>(`/maps/search?keyword=${encodeURIComponent(keyword)}`);
      if (current !== searchId) return;
      const { level, country, province, city, citySelected } = this.data;
      const listed = (hit: { level: Level; country: string; province: string }) => !citySelected && hit.level === level &&
        (level === "country" || hit.country === country) && (level !== "city" || hit.province === province);
      const globalRegions = result.regions.filter(hit => !listed(hit)).map(hit => ({
        ...hit,
        key: JSON.stringify([hit.level, hit.country, hit.province, hit.city]),
        label: placeLabel([hit.country || missingLabel.country, hit.level === "country" ? "" : hit.province || missingLabel.province, hit.level === "city" ? hit.city || missingLabel.city : ""])
      }));
      const globalContacts = result.contacts
        .filter(hit => !(citySelected && hit.country === country && hit.province === province && hit.city === city))
        .map(hit => ({ ...hit, name: cut(hit.name, 30), organization: cut(hit.organization, 40), place: placeLabel([hit.country, hit.province, hit.city]) }));
      this.setData({ globalRegions, globalContacts });
    } catch (error) {
      if (current === searchId) this.setData({ globalRegions: [], globalContacts: [] });
    }
  },

  openGlobalRegion(event: any) {
    const hit = this.data.globalRegions.find(item => item.key === event.currentTarget.dataset.key);
    if (!hit) return;
    if (hit.level === "country") this.setData({ level: "province", country: hit.country, province: "", city: "", citySelected: false, keyword: "" });
    else if (hit.level === "province") this.setData({ level: "city", country: hit.country, province: hit.province, city: "", citySelected: false, keyword: "" });
    else this.setData({ level: "city", country: hit.country, province: hit.province, city: hit.city, citySelected: true, keyword: "" });
    this.load();
  },

  // Opens the contact's city filtered to that contact; without a full place, opens the contact itself.
  openGlobalContact(event: any) {
    const hit = this.data.globalContacts.find(item => item.id === Number(event.currentTarget.dataset.id));
    if (!hit) return;
    if (!hit.country || !hit.province || !hit.city) {
      wx.navigateTo({ url: `/pages/contact-detail/index?id=${hit.id}` });
      return;
    }
    this.pendingKeyword = hit.name;
    this.setData({ level: "city", country: hit.country, province: hit.province, city: hit.city, citySelected: true });
    this.load();
  },

  clearKeyword() {
    this.setData({ keyword: "" });
    this.filter("");
    this.searchAll("");
  },

  // Filters the list and the map markers together, so the map never shows what the list hides.
  filter(keyword: string) {
    if (this.data.citySelected) {
      const filtered = this.cityContactList.filter(item => contactMatchesKeyword(item, keyword));
      const ids = new Set(filtered.map(item => Number(item.id)));
      this.setData({ filteredContacts: filtered.map(cityRow), markers: this.allMarkers.filter(marker => ids.has(Number(marker.contactId))) });
    } else {
      const kw = keyword.trim().toLowerCase();
      const filtered = this.data.regions.filter(item => item.label.toLowerCase().includes(kw));
      const names = new Set(filtered.map(item => item.name));
      this.setData({ filteredRegions: filtered, markers: this.allMarkers.filter(marker => names.has(marker.name)) });
    }
  },

  mapMarkerTap(event: any) {
    const marker = this.data.markers.find((item: any) => item.id === event.detail.markerId);
    if (!marker) return;
    if (this.data.citySelected && marker.contactId) {
      this.setData({
        center: { latitude: marker.latitude, longitude: marker.longitude },
        includePoints: [{ latitude: marker.latitude, longitude: marker.longitude }],
        mapScale: 16
      });
    } else if (marker.name) {
      this.chooseRegion(marker.name);
    }
  },

  focusContact(event: any) {
    this.mapMarkerTap({ detail: { markerId: Number(event.currentTarget.dataset.id) } });
  },

  setContactLocation(event: any) {
    wx.navigateTo({ url: `/pages/contact-form/index?id=${event.currentTarget.dataset.id}` });
  },

  viewCityContacts() {
    wx.setStorageSync("contact-filter-region", { country: this.data.country, province: this.data.province, city: this.data.city });
    wx.switchTab({ url: "/pages/contacts/index" });
  },

  selectRegion(event: any) {
    this.chooseRegion(event.currentTarget.dataset.name as string);
  },

  selectFromPicker(event: any) {
    const region = this.data.filteredRegions[Number(event.detail.value)];
    if (region) this.chooseRegion(region.name);
  },

  chooseRegion(name: string) {
    if (this.data.level === "country") {
      this.setData({ level: "province", country: name, province: "", city: "", citySelected: false, keyword: "" });
    } else if (this.data.level === "province") {
      this.setData({ level: "city", province: name, city: "", citySelected: false, keyword: "" });
    } else {
      this.setData({ city: name, citySelected: true, keyword: "" });
    }
    this.load();
  },

  selectCountryMarker(name: string) {
    if (this.data.level !== "country") return;
    const open = () => {
      this.setData({ level: "province", country: name, province: "", city: "", citySelected: false, keyword: "" });
      this.load();
    };
    if (globe) globe.rotateTo(name, open); else open();
  },

  resetGlobe() { globe?.reset(); },

  globeTouchStart(event: any) { globe?.touchStart(event); },
  globeTouchMove(event: any) { globe?.touchMove(event); },
  globeTouchEnd(event: any) {
    const tap = globe?.touchEnd(event);
    if (!tap) return;
    wx.createSelectorQuery().select("#globe-canvas").boundingClientRect((rect: any) => {
      const name = rect && globe ? globe.pick(tap, rect) : "";
      if (name) this.selectCountryMarker(name);
    }).exec();
  },

  backToWorld() { this.setData({ level: "country", country: "", province: "", city: "", citySelected: false, keyword: "" }); this.load(); },
  backToCountry() { this.setData({ level: "province", province: "", city: "", citySelected: false, keyword: "" }); this.load(); },
  backToCityList() { this.setData({ city: "", citySelected: false, keyword: "" }); this.load(); }
});
