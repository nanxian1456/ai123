// The 3D globe on the map page: scene setup, on-demand rendering, country borders and contact markers,
// rotation and touch handling. The page owns the data and navigation; this module only draws.
import { smallCountryPoint } from "./region-points";

export interface GlobeRegion { name: string; count: number; }
export interface GlobeOptions {
  THREE: any;
  canvas: any;
  width: number;
  height: number;
  pixelRatio: number;
  world: any[];
  paused: boolean;
  // Runs a callback soon, after the current frame (the page passes its setTimeout).
  schedule: (callback: () => void) => void;
  onFirstFrame: () => void;
  onError: (message: string) => void;
}
export interface Globe {
  setRegions(regions: GlobeRegion[]): void;
  setPaused(paused: boolean): void;
  rotateTo(name: string, onDone?: () => void): void;
  reset(): void;
  touchStart(event: any): void;
  touchMove(event: any): void;
  // The touch point when the gesture was a tap on a globe with markers, otherwise null.
  touchEnd(event: any): { clientX: number; clientY: number } | null;
  // The country marker under a tap, given the canvas rectangle.
  pick(point: { clientX: number; clientY: number }, rect: { left: number; top: number; width: number; height: number }): string;
  dispose(): void;
}

// Border colour buckets: 0 = no contacts, 3 = most contacts.
const BORDER_STYLES = [
  { color: 0x658bb5, opacity: 0.6 }, { color: 0x75baff, opacity: 0.95 },
  { color: 0xb9ddff, opacity: 0.95 }, { color: 0xffffff, opacity: 0.95 }
];
function borderBucket(count: number, max: number) {
  if (!count) return 0;
  const ratio = count / max;
  return ratio > 0.66 ? 3 : ratio > 0.32 ? 2 : 1;
}
const distance = (a: any, b: any) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

// Longitude/latitude of a country: its outline centre, or a fixed point for countries too small to outline.
export function countryCenter(world: any[], name: string): [number, number] | null {
  const feature = world.find((item: any) => item.zh === name || item.en === name);
  if (feature) return feature.center;
  const point = smallCountryPoint(name);
  return point ? [point.longitude, point.latitude] : null;
}

export function createGlobe(options: GlobeOptions): Globe {
  const { THREE, canvas, world } = options;
  let paused = options.paused;
  let frame: any = null;
  let flyFrame: any = null;
  let signature: string | null = null;
  let decorated = false;
  let pending: GlobeRegion[] = [];
  let firstFrame: (() => void) | null = null;
  let dragState: { x: number; y: number; moved: boolean } | null = null;
  let pinchDistance = 0;
  let markerObjects: any[] = [];
  let disposed = false;
  const textures = new Set<any>();

  const lonLat = (lon: number, lat: number, radius = 1.006) => {
    const phi = lat * Math.PI / 180;
    const theta = lon * Math.PI / 180;
    return new THREE.Vector3(Math.cos(phi) * Math.sin(theta) * radius, Math.sin(phi) * radius, Math.cos(phi) * Math.cos(theta) * radius);
  };

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x02050c);
  const camera = new THREE.PerspectiveCamera(32, options.width / options.height, 0.1, 100);
  camera.position.z = 3.1;
  // Capped at 2 by the page: a 3x canvas draws 2.25x the pixels for no visible gain, and MSAA is only needed below 2x.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: options.pixelRatio < 2 });
  renderer.setPixelRatio(options.pixelRatio);
  renderer.setSize(options.width, options.height, false);
  const globeGroup = new THREE.Group(); const countryGroup = new THREE.Group(); const markerGroup = new THREE.Group();
  globeGroup.add(countryGroup); globeGroup.add(markerGroup); scene.add(globeGroup);
  scene.add(new THREE.AmbientLight(0x22364f, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2df, 1.4); sun.position.set(3, 1.4, 2.4); scene.add(sun);
  const fill = new THREE.DirectionalLight(0x4a7dd6, 0.25); fill.position.set(-3, -1.5, -1.5); scene.add(fill);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 36), new THREE.MeshPhongMaterial({ color: 0x071c3b, specular: 0x5599dd, shininess: 22 }));
  globeGroup.add(earth);

  // Drawn only when something changes, and never while hidden or drilled down.
  function requestRender() {
    if (disposed || paused || frame) return;
    frame = canvas.requestAnimationFrame(() => {
      frame = null;
      if (disposed || paused) return;
      renderer.render(scene, camera);
      if (firstFrame) { const done = firstFrame; firstFrame = null; done(); }
    });
  }

  function clearGroup(group: any) {
    group.traverse((object: any) => { if (object.geometry) object.geometry.dispose(); if (object.material) object.material.dispose(); });
    while (group.children.length) group.remove(group.children[0]);
  }

  // All borders of one colour share a single LineSegments: 4 draw calls instead of one per ring (~290).
  function rebuildCountries(regions: GlobeRegion[]) {
    clearGroup(countryGroup);
    const max = Math.max(1, ...regions.map(item => item.count));
    const counts = new Map<string, number>();
    regions.forEach(item => counts.set(item.name, item.count));
    const buckets: number[][] = BORDER_STYLES.map(() => []);
    world.forEach((feature: any) => {
      const out = buckets[borderBucket(counts.get(feature.zh) || counts.get(feature.en) || 0, max)];
      feature.polygons.forEach((polygon: number[][][]) => polygon.forEach((ring: number[][]) => {
        for (let i = 0; i < ring.length; i++) {
          const a = lonLat(ring[i][0], ring[i][1]);
          const b = lonLat(ring[(i + 1) % ring.length][0], ring[(i + 1) % ring.length][1]);
          out.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }));
    });
    buckets.forEach((positions, index) => {
      if (!positions.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.addAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
      const style = BORDER_STYLES[index];
      countryGroup.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity })));
    });
  }

  function rebuildMarkers(regions: GlobeRegion[]) {
    clearGroup(markerGroup); markerObjects = [];
    const max = Math.max(1, ...regions.map(item => item.count));
    regions.forEach(region => {
      const center = countryCenter(world, region.name);
      if (!center) return;
      const size = 0.028 + 0.052 * region.count / max;
      const group = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(size * 2.4, 14, 14), new THREE.MeshBasicMaterial({ color: 0x2488ff, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false }));
      group.add(core); group.add(halo);
      group.position.copy(lonLat(center[0], center[1], 1.045));
      group.userData = { name: region.name };
      markerGroup.add(group); markerObjects.push(group);
    });
  }

  function decorate() {
    function loadTexture(file: string, applyTexture: (texture: any) => void, required = false) {
      const image = canvas.createImage();
      image.onload = () => {
        if (disposed) return;
        const texture = new THREE.Texture(image);
        // Keep imagery aligned with the existing longitude origin and country outlines.
        texture.wrapS = THREE.RepeatWrapping;
        texture.offset.x = 0.25;
        texture.needsUpdate = true;
        textures.add(texture);
        applyTexture(texture);
        requestRender();
      };
      image.onerror = () => {
        if (!disposed && required) options.onError("地球纹理加载失败，请重新进入地图");
      };
      image.src = `/assets/images/${file}`;
    }
    loadTexture("earth-day.jpg", texture => {
      earth.material.color.setHex(0xffffff);
      earth.material.map = texture;
      earth.material.needsUpdate = true;
    }, true);
    loadTexture("earth-water.jpg", texture => {
      earth.material.specularMap = texture;
      earth.material.needsUpdate = true;
    });
    // A static cloud layer keeps the globe's idle rendering and battery savings.
    const clouds = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false });
    const cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1.012, 48, 36), clouds);
    cloudMesh.renderOrder = 1;
    cloudMesh.visible = false;
    globeGroup.add(cloudMesh);
    loadTexture("earth-clouds.jpg", texture => {
      clouds.map = texture;
      clouds.alphaMap = texture;
      clouds.needsUpdate = true;
      cloudMesh.visible = true;
    });
    const vertexShader = "varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.16, 40, 30), new THREE.ShaderMaterial({
      vertexShader,
      // Clamp before pow: fractional powers of negative values are undefined in GLSL.
      fragmentShader: "varying vec3 vNormal; void main() { float intensity = pow(clamp(0.62 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.2); gl_FragColor = vec4(0.3, 0.58, 1.0, 1.0) * intensity; }",
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    }));
    halo.renderOrder = 3;
    globeGroup.add(halo);
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.001, 40, 30), new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: "varying vec3 vNormal; void main() { float rim = pow(clamp(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 3.0); gl_FragColor = vec4(0.35, 0.62, 1.0, 1.0) * rim * 0.55; }",
      side: THREE.FrontSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    }));
    rim.renderOrder = 2;
    globeGroup.add(rim);
    const grid: any[] = [];
    for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 3) grid.push(lonLat(lon, lat, 1.002), lonLat(lon + 3, lat, 1.002));
    for (let lon = -180; lon < 180; lon += 30) for (let lat = -90; lat < 90; lat += 3) grid.push(lonLat(lon, lat, 1.002), lonLat(lon, lat + 3, 1.002));
    globeGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid),
      new THREE.LineBasicMaterial({ color: 0x2874c4, transparent: true, opacity: 0.12, depthWrite: false })));
    const count = 400;
    const stars = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 8 + Math.random() * 12;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      stars[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      stars[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      stars[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.addAttribute("position", new THREE.BufferAttribute(stars, 3));
    scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xe7f2ff, size: 0.022, transparent: true, opacity: 0.55 })));
    decorated = true;
    apply(pending);
  }

  // Rebuild the borders and markers only when the counts changed.
  function apply(regions: GlobeRegion[]) {
    pending = regions;
    if (!decorated) return;
    const next = JSON.stringify(regions.map(item => [item.name, item.count]));
    if (next === signature) return;
    signature = next;
    rebuildCountries(regions);
    rebuildMarkers(regions);
    requestRender();
  }

  function cancelFly() {
    if (flyFrame) canvas.cancelAnimationFrame(flyFrame);
    flyFrame = null;
  }

  // Show the bare sphere first, then add the texture, borders and decorations,
  // so the canvas is never left black while the whole scene is built.
  firstFrame = () => {
    options.onFirstFrame();
    options.schedule(() => {
      if (disposed) return;
      try { decorate(); requestRender(); }
      catch (error) { console.error("3D globe decoration failed", error); }
    });
  };
  requestRender();

  return {
    setRegions: apply,
    setPaused(next: boolean) {
      paused = next;
      if (paused) {
        if (frame) { canvas.cancelAnimationFrame(frame); frame = null; }
        cancelFly();
      } else requestRender();
    },
    rotateTo(name: string, onDone?: () => void) {
      const center = countryCenter(world, name);
      if (disposed || !center) { onDone && onDone(); return; }
      cancelFly();
      const targetX = Math.max(-1.2, Math.min(1.2, -center[1] * Math.PI / 180));
      const targetY = -center[0] * Math.PI / 180;
      const startX = globeGroup.rotation.x;
      const startY = globeGroup.rotation.y;
      let deltaY = targetY - startY;
      while (deltaY > Math.PI) deltaY -= 2 * Math.PI;
      while (deltaY < -Math.PI) deltaY += 2 * Math.PI;
      const endY = startY + deltaY;
      const duration = 550;
      const startTime = Date.now();
      const step = () => {
        const t = Math.min(1, (Date.now() - startTime) / duration);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        globeGroup.rotation.x = startX + (targetX - startX) * ease;
        globeGroup.rotation.y = startY + (endY - startY) * ease;
        requestRender();
        if (t < 1) flyFrame = canvas.requestAnimationFrame(step);
        else { flyFrame = null; onDone && onDone(); }
      };
      flyFrame = canvas.requestAnimationFrame(step);
    },
    reset() { globeGroup.rotation.set(0, 0, 0); camera.position.z = 3.1; requestRender(); },
    touchStart(event: any) {
      if (event.touches.length >= 2) { dragState = null; pinchDistance = distance(event.touches[0], event.touches[1]); return; }
      const touch = event.touches[0]; dragState = { x: touch.pageX, y: touch.pageY, moved: false };
    },
    touchMove(event: any) {
      if (event.touches.length >= 2) {
        const next = distance(event.touches[0], event.touches[1]);
        if (pinchDistance) { camera.position.z = Math.max(1.8, Math.min(5, camera.position.z - (next - pinchDistance) / 350)); requestRender(); }
        pinchDistance = next; return;
      }
      if (!dragState) return;
      const touch = event.touches[0];
      const dx = touch.pageX - dragState.x; const dy = touch.pageY - dragState.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragState.moved = true;
      globeGroup.rotation.y += dx / 180; globeGroup.rotation.x = Math.max(-0.8, Math.min(0.8, globeGroup.rotation.x + dy / 240));
      dragState.x = touch.pageX; dragState.y = touch.pageY;
      requestRender();
    },
    touchEnd(event: any) {
      const tapped = dragState && !dragState.moved && markerObjects.length ? event.changedTouches[0] : null;
      dragState = null; pinchDistance = 0;
      return tapped ? { clientX: tapped.clientX, clientY: tapped.clientY } : null;
    },
    pick(point, rect) {
      if (disposed) return "";
      const pointer = new THREE.Vector2(((point.clientX - rect.left) / rect.width) * 2 - 1, -((point.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(markerObjects)[0];
      const surface = raycaster.intersectObject(earth)[0];
      let target = hit ? hit.object : null;
      while (target && !target.userData.name) target = target.parent;
      return hit && (!surface || hit.distance < surface.distance) && target && target.userData.name ? target.userData.name : "";
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) canvas.cancelAnimationFrame(frame);
      cancelFly();
      frame = null; firstFrame = null; markerObjects = [];
      const resources = new Set<any>();
      scene.traverse((object: any) => {
        if (object.geometry) resources.add(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((material: any) => resources.add(material));
      });
      textures.forEach(texture => resources.add(texture));
      resources.forEach(resource => resource.dispose());
      textures.clear();
      renderer.dispose();
    }
  };
}
