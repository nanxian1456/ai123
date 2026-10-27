"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const world = require("../../assets/data/world.js");
const jiangsuGeo = require("../../assets/data/jiangsu.js");
const { createScopedThreejs } = require("threejs-miniprogram");
const missingLabel = { country: "未设置国家", province: "未设置省份", city: "未设置城市" };
const LEVEL_TITLE = { country: "国家 / 地区", province: "省份 / 州", city: "城市" };
const PALETTE = ["#1677d2", "#16a889", "#e6a23c", "#f56c6c", "#8e44ad", "#2c3e50", "#3498db", "#1abc9c"];
function avatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++)
        hash = (hash << 5) - hash + name.charCodeAt(i);
    return PALETTE[Math.abs(hash) % PALETTE.length];
}
let loadId = 0;
let THREE;
let scene;
let camera;
let renderer;
let globeGroup;
let countryGroup;
let markerGroup;
let markerObjects = [];
let canvas;
let canvasSize = { width: 1, height: 1 };
let frame;
let flyFrame;
let dragState = null;
let pinchDistance = 0;
let earth;
let cloudMesh;
function makeTexture(image) {
    const texture = new THREE.Texture(image);
    // SphereGeometry's UV origin is 90 degrees west of our longitude origin.
    texture.wrapS = THREE.RepeatWrapping;
    texture.offset.x = 0.25;
    texture.needsUpdate = true;
    return texture;
}
function lonLat(lon, lat, radius = 1.006) {
    const phi = lat * Math.PI / 180;
    const theta = lon * Math.PI / 180;
    return new THREE.Vector3(Math.cos(phi) * Math.sin(theta) * radius, Math.sin(phi) * radius, Math.cos(phi) * Math.cos(theta) * radius);
}
function distance(a, b) { return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY); }
function isJiangsu(name) { return ["江苏", "江苏省", "Jiangsu"].includes(name); }
function buildJiangsuPolygons() {
    const coordinates = jiangsuGeo.features[0].geometry.coordinates;
    return coordinates.map((polygon) => {
        const ring = polygon[0];
        const stride = Math.max(1, Math.ceil(ring.length / 320));
        const points = ring.filter((_, index) => index % stride === 0 || index === ring.length - 1)
            .map((point) => ({ longitude: point[0], latitude: point[1] }));
        if (points.length && (points[0].longitude !== points[points.length - 1].longitude || points[0].latitude !== points[points.length - 1].latitude))
            points.push(points[0]);
        return { points, strokeWidth: 3, strokeColor: "#1677D2", fillColor: "#1677D20D", zIndex: 2 };
    });
}
function countryMaterial(count, max) {
    const ratio = max ? count / max : 0;
    const color = ratio > 0.66 ? 0xffffff : ratio > 0.32 ? 0xb9ddff : count ? 0x75baff : 0x658bb5;
    return new THREE.LineBasicMaterial({ color, transparent: true, opacity: count ? 0.95 : 0.6 });
}
function drawCountry(feature, count, max) {
    const group = new THREE.Group();
    const material = countryMaterial(count, max);
    feature.polygons.forEach((polygon) => polygon.forEach((ring) => {
        const points = ring.map(point => lonLat(point[0], point[1]));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        group.add(new THREE.LineLoop(geometry, material));
    }));
    group.userData = { name: feature.zh || feature.en, count };
    countryGroup.add(group);
}
function clearGroup(group) {
    group.traverse((object) => { if (object.geometry)
        object.geometry.dispose(); if (object.material)
        object.material.dispose(); });
    while (group.children.length)
        group.remove(group.children[0]);
}
function rebuildCountries(regions) {
    if (!countryGroup)
        return;
    clearGroup(countryGroup);
    const max = Math.max(1, ...regions.map(item => item.count));
    const counts = new Map();
    regions.forEach(item => counts.set(item.name, item.count));
    world.forEach((feature) => drawCountry(feature, counts.get(feature.zh) || counts.get(feature.en) || 0, max));
}
function rebuildMarkers(regions) {
    if (!markerGroup)
        return;
    clearGroup(markerGroup);
    markerObjects = [];
    const max = Math.max(1, ...regions.map(item => item.count));
    regions.forEach(region => {
        const feature = world.find((item) => item.zh === region.name || item.en === region.name);
        if (!feature)
            return;
        const size = 0.028 + 0.052 * region.count / max;
        const group = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
        const halo = new THREE.Mesh(new THREE.SphereGeometry(size * 2.4, 14, 14), new THREE.MeshBasicMaterial({ color: 0x2488ff, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false }));
        group.add(core);
        group.add(halo);
        group.position.copy(lonLat(feature.center[0], feature.center[1], 1.045));
        group.userData = { name: region.name };
        markerGroup.add(group);
        markerObjects.push(group);
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
    const vertexShader = [
        "varying vec3 vNormal;",
        "void main() {",
        "  vNormal = normalize(normalMatrix * normal);",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}"
    ].join("\n");
    const haloMaterial = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: [
            "varying vec3 vNormal;",
            "void main() {",
            "  float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.2);",
            "  gl_FragColor = vec4(0.3, 0.58, 1.0, 1.0) * intensity;",
            "}"
        ].join("\n"),
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.16, 48, 36), haloMaterial);
    halo.renderOrder = 3;
    globeGroup.add(halo);
    const rimMaterial = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: [
            "varying vec3 vNormal;",
            "void main() {",
            "  float rim = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);",
            "  gl_FragColor = vec4(0.35, 0.62, 1.0, 1.0) * rim * 0.55;",
            "}"
        ].join("\n"),
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
    });
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.001, 48, 36), rimMaterial);
    rim.renderOrder = 2;
    globeGroup.add(rim);
}
function createClouds() {
    cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1.012, 48, 36), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false }));
    cloudMesh.renderOrder = 1;
    globeGroup.add(cloudMesh);
    const cloudImage = canvas.createImage();
    cloudImage.onload = () => {
        // Same texture drives map + alphaMap: white clouds show, black stays invisible,
        // and both share the map's uvTransform (r108 ignores alphaMap-only offsets).
        const cloudTexture = makeTexture(cloudImage);
        cloudMesh.material.map = cloudTexture;
        cloudMesh.material.alphaMap = cloudTexture;
        cloudMesh.material.needsUpdate = true;
    };
    cloudImage.src = "/assets/images/earth-clouds.jpg";
}
function createGlobeGrid() {
    const points = [];
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
    const material = new THREE.LineBasicMaterial({ color: 0x2874c4, transparent: true, opacity: 0.12, depthWrite: false });
    globeGroup.add(new THREE.LineSegments(geometry, material));
}
function animate() {
    if (!renderer || !scene || !camera)
        return;
    frame = canvas.requestAnimationFrame(animate);
    if (cloudMesh)
        cloudMesh.rotation.y += 0.00045;
    renderer.render(scene, camera);
}
function cancelFly() {
    if (flyFrame && canvas)
        canvas.cancelAnimationFrame(flyFrame);
    flyFrame = null;
}
function rotateTo(name, onDone) {
    if (!globeGroup || !canvas) {
        onDone && onDone();
        return;
    }
    const feature = world.find((item) => item.zh === name || item.en === name);
    if (!feature) {
        onDone && onDone();
        return;
    }
    cancelFly();
    const lat = feature.center[1];
    const lon = feature.center[0];
    const targetX = Math.max(-1.2, Math.min(1.2, -lat * Math.PI / 180));
    const targetY = -lon * Math.PI / 180;
    const startX = globeGroup.rotation.x;
    const startY = globeGroup.rotation.y;
    let deltaY = targetY - startY;
    while (deltaY > Math.PI)
        deltaY -= 2 * Math.PI;
    while (deltaY < -Math.PI)
        deltaY += 2 * Math.PI;
    const endY = startY + deltaY;
    const duration = 550;
    const startTime = Date.now();
    const step = () => {
        const now = Date.now();
        const t = Math.min(1, (now - startTime) / duration);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        globeGroup.rotation.x = startX + (targetX - startX) * ease;
        globeGroup.rotation.y = startY + (endY - startY) * ease;
        if (t < 1)
            flyFrame = canvas.requestAnimationFrame(step);
        else {
            flyFrame = null;
            onDone && onDone();
        }
    };
    flyFrame = canvas.requestAnimationFrame(step);
}
function contactOffset(index) {
    const golden = 137.508 * (Math.PI / 180);
    const angle = index * golden;
    const ring = 1 + Math.floor(index / 8);
    const radius = 0.0018 * ring;
    return { lat: radius * Math.cos(angle), lng: radius * Math.sin(angle) };
}
Page({
    data: {
        level: "country",
        country: "",
        province: "",
        city: "",
        citySelected: false,
        regions: [],
        filteredRegions: [],
        total: 0,
        loading: false,
        error: "",
        keyword: "",
        center: null,
        markers: [],
        includePoints: [],
        mapScale: 5,
        mapError: "",
        globeError: "",
        provincePolygons: [],
        cityContacts: [],
        filteredContacts: [],
        levelTitle: LEVEL_TITLE.country
    },
    onReady() {
        wx.createSelectorQuery().select("#globe-canvas").fields({ node: true, size: true }).exec((result) => {
            if (!result[0]?.node || !result[0].width || !result[0].height) {
                this.setData({ globeError: "当前设备无法显示地球" });
                return;
            }
            try {
                canvas = result[0].node;
                canvasSize = { width: result[0].width, height: result[0].height };
                THREE = createScopedThreejs(canvas);
                scene = new THREE.Scene();
                scene.background = new THREE.Color(0x02050c);
                camera = new THREE.PerspectiveCamera(32, canvasSize.width / canvasSize.height, 0.1, 100);
                camera.position.z = 3.1;
                renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
                renderer.setPixelRatio(wx.getSystemInfoSync().pixelRatio);
                renderer.setSize(canvasSize.width, canvasSize.height, false);
                globeGroup = new THREE.Group();
                countryGroup = new THREE.Group();
                markerGroup = new THREE.Group();
                globeGroup.add(countryGroup);
                globeGroup.add(markerGroup);
                scene.add(globeGroup);
                // Realistic day/night lighting: dim cool ambient, a warm "sun" and a faint blue fill for the night side.
                scene.add(new THREE.AmbientLight(0x22364f, 0.85));
                const sun = new THREE.DirectionalLight(0xfff2df, 1.4);
                sun.position.set(3, 1.4, 2.4);
                scene.add(sun);
                const fill = new THREE.DirectionalLight(0x4a7dd6, 0.25);
                fill.position.set(-3, -1.5, -1.5);
                scene.add(fill);
                earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshPhongMaterial({ color: 0x071c3b, specular: 0x5599dd, shininess: 22 }));
                const earthMaterial = earth.material;
                const dayImage = canvas.createImage();
                dayImage.onload = () => {
                    earthMaterial.color.setHex(0xffffff);
                    earthMaterial.map = makeTexture(dayImage);
                    earthMaterial.needsUpdate = true;
                };
                dayImage.onerror = () => this.setData({ globeError: "地球纹理加载失败，请重新进入地图" });
                dayImage.src = "/assets/images/earth-day.jpg";
                const waterImage = canvas.createImage();
                waterImage.onload = () => {
                    // White = ocean in the mask, so only the water catches the sun's specular highlight.
                    earthMaterial.specularMap = makeTexture(waterImage);
                    earthMaterial.needsUpdate = true;
                };
                waterImage.src = "/assets/images/earth-water.jpg";
                globeGroup.add(earth);
                createClouds();
                createAtmosphere();
                createGlobeGrid();
                createStarfield();
                rebuildCountries(this.data.level === "country" ? this.data.regions : []);
                rebuildMarkers(this.data.level === "country" ? this.data.regions : []);
                animate();
            }
            catch (error) {
                renderer = null;
                console.error("3D globe initialization failed", error);
                this.setData({ globeError: "3D 地球初始化失败，请重新进入地图" });
            }
        });
    },
    onShow() { if (renderer && !frame)
        animate(); this.load(); },
    onHide() {
        if (frame && canvas)
            canvas.cancelAnimationFrame(frame);
        frame = null;
        cancelFly();
    },
    onUnload() {
        if (frame && canvas)
            canvas.cancelAnimationFrame(frame);
        cancelFly();
        renderer?.dispose();
        renderer = null;
        scene = null;
        globeGroup = null;
        countryGroup = null;
        markerGroup = null;
        markerObjects = [];
        canvas = null;
        frame = null;
        earth = null;
        cloudMesh = null;
    },
    async load() {
        const { level, country, province, city, citySelected } = this.data;
        const current = ++loadId;
        this.setData({
            loading: true, error: "", regions: [], filteredRegions: [], total: 0,
            center: null, markers: [], includePoints: [], mapError: "",
            cityContacts: [], filteredContacts: [], keyword: "", levelTitle: citySelected ? "联系人" : LEVEL_TITLE[level],
            provincePolygons: level === "city" && !citySelected && isJiangsu(province) ? buildJiangsuPolygons() : []
        });
        try {
            const items = await (0, api_1.request)(`/maps/regions?level=${level}&country=${encodeURIComponent(country)}&province=${encodeURIComponent(province)}&sample=true`);
            if (current !== loadId)
                return;
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
            if (level === "country") {
                rebuildCountries(items);
                rebuildMarkers(items);
            }
            else {
                if (!country || level === "city" && !province || citySelected && !city) {
                    this.setData({ mapError: "当前地区未设置，无法定位" });
                }
                else {
                    await this.loadLocations(current, level, country, province, citySelected ? city : "");
                }
                if (level === "city" && citySelected)
                    await this.loadCityContacts(current, country, province);
            }
        }
        catch (error) {
            if (current !== loadId)
                return;
            this.setData({ loading: false, error: "地区数据加载失败" });
            (0, api_1.showError)(error);
        }
    },
    async loadLocations(current, level, country, province, city) {
        try {
            const result = await (0, api_1.request)(`/maps/locations?level=${level}&country=${encodeURIComponent(country)}&province=${encodeURIComponent(province)}&city=${encodeURIComponent(city)}`);
            if (current !== loadId)
                return;
            const markers = result.markers.map((item, id) => ({
                id,
                latitude: item.latitude,
                longitude: item.longitude,
                iconPath: "/assets/images/map-marker.png",
                width: 28,
                height: 28,
                anchor: { x: 0.5, y: 1 },
                title: `${item.name} ${item.count}人`,
                name: item.name,
                label: { content: `${item.name} ${item.count}人`, color: "#17324e", fontSize: 11, bgColor: "#ffffff", borderRadius: 4, padding: 4, anchorX: 0, anchorY: -32 }
            }));
            const includePoints = markers.map(m => ({ latitude: m.latitude, longitude: m.longitude }));
            if (result.center)
                includePoints.push({ latitude: result.center.latitude, longitude: result.center.longitude });
            if (level === "city" && !this.data.citySelected && isJiangsu(province) && this.data.provincePolygons.length) {
                const points = this.data.provincePolygons.flatMap((polygon) => polygon.points);
                const longitudes = points.map((point) => point.longitude);
                const latitudes = points.map((point) => point.latitude);
                const west = Math.min(...longitudes);
                const east = Math.max(...longitudes);
                const south = Math.min(...latitudes);
                const north = Math.max(...latitudes);
                includePoints.push({ latitude: south, longitude: west }, { latitude: north, longitude: east });
            }
            const mapScale = level === "province" || level === "city" && !this.data.citySelected && isJiangsu(province) ? 6 : 9;
            this.setData({ center: result.center, markers, includePoints, mapScale });
        }
        catch (error) {
            if (current === loadId)
                this.setData({ mapError: error instanceof Error ? error.message : "地图定位暂不可用" });
        }
    },
    async loadCityContacts(current, country, province) {
        try {
            const items = await (0, api_1.request)(`/contacts/directory?country=${encodeURIComponent(country)}&province=${encodeURIComponent(province)}&city=${encodeURIComponent(this.data.city)}`);
            if (current !== loadId)
                return;
            const contacts = items.map(item => ({ ...item, color: avatarColor(item.name) }));
            const center = this.data.center;
            let markers = [];
            if (center) {
                markers = contacts.map((item, index) => {
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
            this.setData({ cityContacts: contacts, filteredContacts: contacts, markers, includePoints, mapScale: 11 });
        }
        catch (error) {
            if (current === loadId)
                this.setData({ mapError: error instanceof Error ? error.message : "联系人定位暂不可用" });
        }
    },
    onKeyword(event) {
        const keyword = event.detail.value || "";
        this.setData({ keyword });
        this.filter(keyword);
    },
    clearKeyword() {
        this.setData({ keyword: "" });
        this.filter("");
    },
    filter(keyword) {
        const kw = keyword.trim().toLowerCase();
        if (this.data.citySelected) {
            const filtered = this.data.cityContacts.filter(item => item.name.toLowerCase().includes(kw) ||
                item.organization.toLowerCase().includes(kw) ||
                item.position.toLowerCase().includes(kw) ||
                item.tags.some(tag => tag.toLowerCase().includes(kw)));
            this.setData({ filteredContacts: filtered });
        }
        else {
            const filtered = this.data.regions.filter(item => item.label.toLowerCase().includes(kw));
            this.setData({ filteredRegions: filtered });
        }
    },
    mapMarkerTap(event) {
        const marker = this.data.markers.find((item) => item.id === event.detail.markerId);
        if (!marker)
            return;
        if (this.data.citySelected && marker.contactId) {
            this.setData({
                center: { latitude: marker.latitude, longitude: marker.longitude },
                includePoints: [{ latitude: marker.latitude, longitude: marker.longitude }],
                mapScale: 16
            });
        }
        else if (marker.name) {
            this.chooseRegion(marker.name);
        }
    },
    focusContact(event) {
        this.mapMarkerTap({ detail: { markerId: Number(event.currentTarget.dataset.id) } });
    },
    setContactLocation(event) {
        wx.navigateTo({ url: `/pages/contact-form/index?id=${event.currentTarget.dataset.id}` });
    },
    viewCityContacts() {
        wx.setStorageSync("contact-filter-region", { country: this.data.country, province: this.data.province, city: this.data.city });
        wx.switchTab({ url: "/pages/contacts/index" });
    },
    selectRegion(event) {
        this.chooseRegion(event.currentTarget.dataset.name);
    },
    selectFromPicker(event) {
        const region = this.data.regions[Number(event.detail.value)];
        if (region)
            this.chooseRegion(region.name);
    },
    chooseRegion(name) {
        if (this.data.level === "country") {
            this.setData({ level: "province", country: name, province: "", city: "", citySelected: false, keyword: "" });
        }
        else if (this.data.level === "province") {
            this.setData({ level: "city", province: name, city: "", citySelected: false, keyword: "" });
        }
        else {
            this.setData({ city: name, citySelected: true, keyword: "" });
        }
        this.load();
    },
    selectCountryMarker(name) {
        if (this.data.level !== "country")
            return;
        rotateTo(name, () => {
            this.setData({ level: "province", country: name, province: "", city: "", citySelected: false, keyword: "" });
            this.load();
        });
    },
    resetGlobe() { if (globeGroup) {
        globeGroup.rotation.set(0, 0, 0);
        camera.position.z = 3.1;
    } },
    globeTouchStart(event) {
        if (event.touches.length >= 2) {
            dragState = null;
            pinchDistance = distance(event.touches[0], event.touches[1]);
            return;
        }
        const touch = event.touches[0];
        dragState = { x: touch.pageX, y: touch.pageY, moved: false };
    },
    globeTouchMove(event) {
        if (!globeGroup)
            return;
        if (event.touches.length >= 2) {
            const next = distance(event.touches[0], event.touches[1]);
            if (pinchDistance)
                camera.position.z = Math.max(1.8, Math.min(5, camera.position.z - (next - pinchDistance) / 350));
            pinchDistance = next;
            return;
        }
        if (!dragState)
            return;
        const touch = event.touches[0];
        const dx = touch.pageX - dragState.x;
        const dy = touch.pageY - dragState.y;
        if (Math.abs(dx) + Math.abs(dy) > 3)
            dragState.moved = true;
        globeGroup.rotation.y += dx / 180;
        globeGroup.rotation.x = Math.max(-0.8, Math.min(0.8, globeGroup.rotation.x + dy / 240));
        dragState.x = touch.pageX;
        dragState.y = touch.pageY;
    },
    globeTouchEnd(event) {
        if (!dragState || dragState.moved || !camera || !markerObjects.length) {
            dragState = null;
            pinchDistance = 0;
            return;
        }
        const touch = event.changedTouches[0];
        wx.createSelectorQuery().select("#globe-canvas").boundingClientRect((rect) => {
            if (!rect || !camera || !THREE)
                return;
            const pointer = new THREE.Vector2(((touch.clientX - rect.left) / rect.width) * 2 - 1, -((touch.clientY - rect.top) / rect.height) * 2 + 1);
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(pointer, camera);
            const hit = raycaster.intersectObjects(markerObjects)[0];
            const surface = raycaster.intersectObject(earth)[0];
            let target = hit ? hit.object : null;
            while (target && !target.userData.name)
                target = target.parent;
            if (hit && (!surface || hit.distance < surface.distance) && target && target.userData.name)
                this.selectCountryMarker(target.userData.name);
        }).exec();
        dragState = null;
        pinchDistance = 0;
    },
    backToWorld() { this.setData({ level: "country", country: "", province: "", city: "", citySelected: false, keyword: "" }); this.load(); },
    backToCountry() { this.setData({ level: "province", province: "", city: "", citySelected: false, keyword: "" }); this.load(); },
    backToCityList() { this.setData({ city: "", citySelected: false, keyword: "" }); this.load(); }
});
