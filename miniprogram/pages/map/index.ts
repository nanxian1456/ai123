import { request, showError } from "../../utils/api";
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
interface CityContact {
  id: number;
  name: string;
  organization: string;
  position: string;
  tags: string[];
  initial: string;
  color: string;
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
let THREE: any;
let scene: any;
let camera: any;
let renderer: any;
let globeGroup: any;
let countryGroup: any;
let markerGroup: any;
let markerObjects: any[] = [];
let canvas: any;
let canvasSize = { width: 1, height: 1 };
let frame: any;
let flyFrame: any;
let dragState: { x: number; y: number; moved: boolean } | null = null;
let pinchDistance = 0;
let earth: any;

function lonLat(lon: number, lat: number, radius = 1.006) {
  const phi = lat * Math.PI / 180;
  const theta = lon * Math.PI / 180;
  return new THREE.Vector3(Math.cos(phi) * Math.sin(theta) * radius, Math.sin(phi) * radius, Math.cos(phi) * Math.cos(theta) * radius);
}

function distance(a: any, b: any) { return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY); }

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

function countryMaterial(count: number, max: number) {
  const ratio = max ? count / max : 0;
  const color = ratio > 0.66 ? 0xffffff : ratio > 0.32 ? 0xb9ddff : count ? 0x75baff : 0x658bb5;
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity: count ? 0.95 : 0.6 });
}

function drawCountry(feature: any, count: number, max: number) {
  const group = new THREE.Group();
  const material = countryMaterial(count, max);
  feature.polygons.forEach((polygon: number[][][]) => polygon.forEach((ring: number[][]) => {
    const points = ring.map(point => lonLat(point[0], point[1]));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.LineLoop(geometry, material));
  }));
  group.userData = { name: feature.zh || feature.en, count };
  countryGroup.add(group);
}

function clearGroup(group: any) {
  group.traverse((object: any) => { if (object.geometry) object.geometry.dispose(); if (object.material) object.material.dispose(); });
  while (group.children.length) group.remove(group.children[0]);
}

function rebuildCountries(regions: { name: string; count: number }[]) {
  if (!countryGroup) return;
  clearGroup(countryGroup);
  const max = Math.max(1, ...regions.map(item => item.count));
  const counts = new Map<string, number>();
  regions.forEach(item => counts.set(item.name, item.count));
  world.forEach((feature: any) => drawCountry(feature, counts.get(feature.zh) || counts.get(feature.en) || 0, max));
}

function rebuildMarkers(regions: { name: string; count: number }[]) {
  if (!markerGroup) return;
  clearGroup(markerGroup); markerObjects = [];
  const max = Math.max(1, ...regions.map(item => item.count));
  regions.forEach(region => {
    const feature = world.find((item: any) => item.zh === region.name || item.en === region.name);
    if (!feature) return;
    const size = 0.028 + 0.052 * region.count / max;
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(size * 2.4, 14, 14), new THREE.MeshBasicMaterial({ color: 0x2488ff, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(core); group.add(halo);
    group.position.copy(lonLat(feature.center[0], feature.center[1], 1.045));
    group.userData = { name: region.name };
    markerGroup.add(group); markerObjects.push(group);
  });
}

function createStarfield() {
  const geometry = new THREE.BufferGeometry();
  const count = 400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 8 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  geometry.addAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xe7f2ff, size: 0.022, transparent: true, opacity: 0.55 });
  scene.add(new THREE.Points(geometry, material));
}

function createAtmosphere() {
  const geometry = new THREE.SphereGeometry(1.055, 40, 30);
  const material = new THREE.MeshBasicMaterial({ color: 0x237aff, transparent: true, opacity: 0.16, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
  globeGroup.add(new THREE.Mesh(geometry, material));
}

function createGlobeGrid() {
  const points: any[] = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 3) {
      points.push(lonLat(lon, lat, 1.002), lonLat(lon + 3, lat, 1.002));
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -90; lat < 90; lat += 3) {
      points.push(lonLat(lon, lat, 1.002), lonLat(lon, lat + 3, 1.002));
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x2874c4, transparent: true, opacity: 0.22, depthWrite: false });
  globeGroup.add(new THREE.LineSegments(geometry, material));
}

function animate() {
  if (!renderer || !scene || !camera) return;
  frame = canvas.requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

function cancelFly() {
  if (flyFrame && canvas) canvas.cancelAnimationFrame(flyFrame);
  flyFrame = null;
}

function rotateTo(name: string, onDone?: () => void) {
  if (!globeGroup || !canvas) { onDone && onDone(); return; }
  const feature = world.find((item: any) => item.zh === name || item.en === name);
  if (!feature) { onDone && onDone(); return; }
  cancelFly();
  const lat = feature.center[1];
  const lon = feature.center[0];
  const targetX = Math.max(-1.2, Math.min(1.2, -lat * Math.PI / 180));
  const targetY = -lon * Math.PI / 180;
  const startX = globeGroup.rotation.x;
  const startY = globeGroup.rotation.y;
  let deltaY = targetY - startY;
  while (deltaY > Math.PI) deltaY -= 2 * Math.PI;
  while (deltaY < -Math.PI) deltaY += 2 * Math.PI;
  const endY = startY + deltaY;
  const duration = 550;
  const startTime = Date.now();
  const step = () => {
    const now = Date.now();
    const t = Math.min(1, (now - startTime) / duration);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    globeGroup.rotation.x = startX + (targetX - startX) * ease;
    globeGroup.rotation.y = startY + (endY - startY) * ease;
    if (t < 1) flyFrame = canvas.requestAnimationFrame(step);
    else { flyFrame = null; onDone && onDone(); }
  };
  flyFrame = canvas.requestAnimationFrame(step);
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
    provincePolygons: [] as any[],
    cityContacts: [] as CityContact[],
    filteredContacts: [] as CityContact[],
    levelTitle: LEVEL_TITLE.country
  },

  onReady() {
    wx.createSelectorQuery().select("#globe-canvas").fields({ node: true, size: true }).exec((result: any[]) => {
      if (!result[0]?.node || !result[0].width || !result[0].height) { this.setData({ globeError: "当前设备无法显示地球" }); return; }
      try {
        canvas = result[0].node;
        canvasSize = { width: result[0].width, height: result[0].height };
        THREE = createScopedThreejs(canvas);
        scene = new THREE.Scene(); scene.background = new THREE.Color(0x02050c);
        camera = new THREE.PerspectiveCamera(32, canvasSize.width / canvasSize.height, 0.1, 100);
        camera.position.z = 3.1;
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        // wx.getSystemInfoSync is deprecated; getWindowInfo exists from base library 2.20.1.
        renderer.setPixelRatio((typeof wx.getWindowInfo === "function" ? wx.getWindowInfo().pixelRatio : 0) || 2);
        renderer.setSize(canvasSize.width, canvasSize.height, false);
        globeGroup = new THREE.Group(); countryGroup = new THREE.Group(); markerGroup = new THREE.Group();
        globeGroup.add(countryGroup); globeGroup.add(markerGroup); scene.add(globeGroup);
        scene.add(new THREE.AmbientLight(0x8cbcff, 0.8));
        const light = new THREE.DirectionalLight(0xffffff, 1.1); light.position.set(2, 2, 3); scene.add(light);
        earth = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 36), new THREE.MeshPhongMaterial({ color: 0x071c3b, specular: 0x2563a6, shininess: 32 }));
        const earthMaterial = earth.material;
        const landImage = canvas.createImage();
        landImage.onload = () => {
          const texture = new THREE.Texture(landImage);
          // SphereGeometry's UV origin is 90 degrees west of our longitude origin.
          texture.wrapS = THREE.RepeatWrapping;
          texture.offset.x = 0.25;
          texture.needsUpdate = true;
          earthMaterial.color.setHex(0xffffff);
          earthMaterial.map = texture;
          earthMaterial.needsUpdate = true;
        };
        landImage.onerror = () => this.setData({ globeError: "陆地纹理加载失败，请重新进入地图" });
        landImage.src = "/assets/images/globe-land.png";
        globeGroup.add(earth);
        createAtmosphere();
        createGlobeGrid();
        createStarfield();
        rebuildCountries(this.data.level === "country" ? this.data.regions : []);
        rebuildMarkers(this.data.level === "country" ? this.data.regions : []);
        animate();
      } catch (error) {
        renderer = null;
        console.error("3D globe initialization failed", error);
        this.setData({ globeError: "3D 地球初始化失败，请重新进入地图" });
      }
    });
  },

  onShow() { if (renderer && !frame) animate(); this.load(); },

  mapTimer: null as ReturnType<typeof setTimeout> | null,
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
  onMapUpdated(event: any) {
    if (Number(event.currentTarget.dataset.loadId) !== loadId || this.data.mapLoadId !== loadId) return;
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
    this.stopMapWait();
    if (frame && canvas) canvas.cancelAnimationFrame(frame);
    frame = null; cancelFly();
  },

  onUnload() {
    loadId++;
    this.stopMapWait();
    if (frame && canvas) canvas.cancelAnimationFrame(frame);
    cancelFly();
    renderer?.dispose();
    renderer = null; scene = null; globeGroup = null; countryGroup = null; markerGroup = null; markerObjects = []; canvas = null; frame = null; earth = null;
  },

  async load() {
    const { level, country, province, city, citySelected } = this.data;
    const current = ++loadId;
    this.stopMapWait();
    this.setData({
      loading: true, error: "", regions: [], filteredRegions: [], total: 0,
      coordinateLoading: level !== "country",
      center: null, markers: [], includePoints: [], mapError: "",
      cityContacts: [], filteredContacts: [], keyword: "", levelTitle: citySelected ? "联系人" : LEVEL_TITLE[level],
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
      this.setData({ regions, filteredRegions: regions, total, loading: false });
      if (level === "country") { rebuildCountries(items); rebuildMarkers(items); }
      else {
        if (!country || level === "city" && !province || citySelected && !city) {
          this.setData({ mapError: "当前地区未设置，无法定位" });
        } else {
          await this.loadLocations(current, level, country, province, citySelected ? city : "");
        }
        if (level === "city" && citySelected) await this.loadCityContacts(current, country, province);
      }
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
    try {
      const regions = city ? [] : this.data.regions.filter(item => item.name.trim());
      const batches: string[][] = [];
      for (let index = 0; index < regions.length; index += 30) {
        batches.push(regions.slice(index, index + 30).map(item => item.name));
      }
      if (!batches.length) batches.push([]);
      let center: { latitude: number; longitude: number } | null = null;
      const points = new Map<string, { latitude: number; longitude: number }>();
      for (const names of batches) {
        const result = await request<{ center: { latitude: number; longitude: number }; markers: { name: string; latitude: number; longitude: number }[] }>(
          "/maps/locations", "POST", { level, country, province, city, regions: names });
        if (current !== loadId) return;
        center = result.center;
        result.markers.forEach(point => {
          if (Number.isFinite(point.latitude) && Number.isFinite(point.longitude)) points.set(point.name, point);
        });
      }
      if (current !== loadId) return;
      // The server supplies coordinates only; names, membership and counts come from this load's local snapshot.
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
      const includePoints = markers.map(m => ({ latitude: m.latitude, longitude: m.longitude }));
      if (center) includePoints.push({ latitude: center.latitude, longitude: center.longitude });
      if (level === "city" && !this.data.citySelected && isJiangsu(province) && this.data.provincePolygons.length) {
        const points = this.data.provincePolygons.flatMap((polygon: any) => polygon.points);
        const longitudes = points.map((point: any) => point.longitude);
        const latitudes = points.map((point: any) => point.latitude);
        const west = Math.min(...longitudes); const east = Math.max(...longitudes);
        const south = Math.min(...latitudes); const north = Math.max(...latitudes);
        includePoints.push({ latitude: south, longitude: west }, { latitude: north, longitude: east });
      }
      const mapScale = level === "province" || level === "city" && !this.data.citySelected && isJiangsu(province) ? 6 : 9;
      const unresolved = regions.length - markers.length;
      this.setData({ center, markers, includePoints, mapScale,
        mapError: unresolved ? `${unresolved} 个地区暂未定位，列表人数仍按本机联系人统计` : "" });
    } catch (error) {
      if (current === loadId) this.setData({ mapError: error instanceof Error ? error.message : "地图定位暂不可用" });
    }
  },

  async loadCityContacts(current: number, country: string, province: string) {
    try {
      const items = await request<{ id: number; name: string; organization: string; position: string; tags: string[]; initial: string; latitude?: number | null; longitude?: number | null }[]>(`/contacts/directory?country=${encodeURIComponent(country)}&province=${encodeURIComponent(province)}&city=${encodeURIComponent(this.data.city)}`);
      if (current !== loadId) return;
      const contacts = items.map(item => ({ ...item, color: avatarColor(item.name) }));
      const cityCenter = this.data.center;
      const hasLocation = (item: typeof items[number]) => typeof item.latitude === "number" && typeof item.longitude === "number" &&
        Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && Math.abs(item.latitude) <= 90 && Math.abs(item.longitude) <= 180;
      const located = items.find(hasLocation);
      const center = cityCenter || (located ? { latitude: located.latitude!, longitude: located.longitude! } : null);
      let markers: any[] = [];
      if (center) {
        markers = contacts.filter(item => cityCenter || hasLocation(item)).map((item, index) => {
          const offset = contactOffset(index);
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
            label: { content: item.name, color: "#17324e", fontSize: 10, bgColor: "#ffffff", borderRadius: 3, padding: 3, anchorX: 0, anchorY: -28 }
          };
        });
      }
      const includePoints = center ? [{ latitude: center.latitude, longitude: center.longitude }, ...markers.map(m => ({ latitude: m.latitude, longitude: m.longitude }))] : [];
      this.setData({ center, cityContacts: contacts, filteredContacts: contacts, markers, includePoints, mapScale: 11 });
    } catch (error) {
      if (current === loadId) this.setData({ mapError: error instanceof Error ? error.message : "联系人定位暂不可用" });
    }
  },

  onKeyword(event: any) {
    const keyword = event.detail.value || "";
    this.setData({ keyword });
    this.filter(keyword);
  },

  clearKeyword() {
    this.setData({ keyword: "" });
    this.filter("");
  },

  filter(keyword: string) {
    const kw = keyword.trim().toLowerCase();
    if (this.data.citySelected) {
      const filtered = this.data.cityContacts.filter(item =>
        item.name.toLowerCase().includes(kw) ||
        item.organization.toLowerCase().includes(kw) ||
        item.position.toLowerCase().includes(kw) ||
        item.tags.some(tag => tag.toLowerCase().includes(kw))
      );
      this.setData({ filteredContacts: filtered });
    } else {
      const filtered = this.data.regions.filter(item => item.label.toLowerCase().includes(kw));
      this.setData({ filteredRegions: filtered });
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
    const region = this.data.regions[Number(event.detail.value)];
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
    rotateTo(name, () => {
      this.setData({ level: "province", country: name, province: "", city: "", citySelected: false, keyword: "" });
      this.load();
    });
  },

  resetGlobe() { if (globeGroup) { globeGroup.rotation.set(0, 0, 0); camera.position.z = 3.1; } },

  globeTouchStart(event: any) {
    if (event.touches.length >= 2) { dragState = null; pinchDistance = distance(event.touches[0], event.touches[1]); return; }
    const touch = event.touches[0]; dragState = { x: touch.pageX, y: touch.pageY, moved: false };
  },

  globeTouchMove(event: any) {
    if (!globeGroup) return;
    if (event.touches.length >= 2) {
      const next = distance(event.touches[0], event.touches[1]);
      if (pinchDistance) camera.position.z = Math.max(1.8, Math.min(5, camera.position.z - (next - pinchDistance) / 350));
      pinchDistance = next; return;
    }
    if (!dragState) return;
    const touch = event.touches[0];
    const dx = touch.pageX - dragState.x; const dy = touch.pageY - dragState.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragState.moved = true;
    globeGroup.rotation.y += dx / 180; globeGroup.rotation.x = Math.max(-0.8, Math.min(0.8, globeGroup.rotation.x + dy / 240));
    dragState.x = touch.pageX; dragState.y = touch.pageY;
  },

  globeTouchEnd(event: any) {
    if (!dragState || dragState.moved || !camera || !markerObjects.length) { dragState = null; pinchDistance = 0; return; }
    const touch = event.changedTouches[0];
    wx.createSelectorQuery().select("#globe-canvas").boundingClientRect((rect: any) => {
      if (!rect || !camera || !THREE) return;
      const pointer = new THREE.Vector2(((touch.clientX - rect.left) / rect.width) * 2 - 1, -((touch.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(markerObjects)[0];
      const surface = raycaster.intersectObject(earth)[0];
      let target = hit ? hit.object : null;
      while (target && !target.userData.name) target = target.parent;
      if (hit && (!surface || hit.distance < surface.distance) && target && target.userData.name) this.selectCountryMarker(target.userData.name);
    }).exec();
    dragState = null; pinchDistance = 0;
  },

  backToWorld() { this.setData({ level: "country", country: "", province: "", city: "", citySelected: false, keyword: "" }); this.load(); },
  backToCountry() { this.setData({ level: "province", province: "", city: "", citySelected: false, keyword: "" }); this.load(); },
  backToCityList() { this.setData({ city: "", citySelected: false, keyword: "" }); this.load(); }
});
