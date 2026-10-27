const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// A minimal Three.js stand-in that counts objects and draw calls.
function fakeThree() {
  const created = {};
  const stats = { renders: 0, created, renderer: null, instances: {} };
  class Vector3 { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } }
  const classes = {};
  const classFor = name => classes[name] || (classes[name] = class {
    constructor(...args) {
      created[name] = (created[name] || 0) + 1;
      this.args = args; this.children = []; this.userData = {};
      (stats.instances[name] ||= []).push(this);
      if (name === "Mesh") { this.geometry = args[0]; this.material = args[1]; }
      if (/Material$/.test(name)) Object.assign(this, args[0]);
      if (name === "Texture") this.offset = { x: 0 };
      this.position = { x: 0, y: 0, z: 0, set() {}, copy() {} };
      this.rotation = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
      this.color = { setHex() {} };
      if (name === "WebGLRenderer") stats.renderer = this;
    }
    add(child) { this.children.push(child); }
    remove(child) { this.children.splice(this.children.indexOf(child), 1); }
    traverse(visit) { visit(this); this.children.forEach(child => child.traverse(visit)); }
    dispose() { this.disposeCount = (this.disposeCount || 0) + 1; }
    addAttribute() { return this; }
    setFromPoints() { return this; }
    setPixelRatio(ratio) { this.pixelRatio = ratio; }
    setSize() {}
    render() { stats.renders++; }
  });
  const THREE = new Proxy({}, { get: (_, key) => key === "Vector3" ? Vector3 : typeof key === "string" && /^[A-Z][a-z]/.test(key) ? classFor(key) : 1 });
  return { THREE, stats };
}

function loadPage() {
  const { THREE, stats } = fakeThree();
  const frames = new Map();
  let nextFrame = 1;
  const timers = [];
  const images = [];
  const canvas = {
    requestAnimationFrame(callback) { frames.set(nextFrame, callback); return nextFrame++; },
    cancelAnimationFrame(id) { frames.delete(id); },
    createImage() { const image = {}; images.push(image); return image; }
  };
  let page;
  const runtimeModule = { exports: {} };
  const sandbox = {
    module: runtimeModule,
    exports: runtimeModule.exports,
    setTimeout: callback => { timers.push(callback); return timers.length; },
    clearTimeout() {},
    require(id) {
      if (id.includes("utils/api")) return {
        request: async url => url.startsWith("/maps/regions") ? [{ name: "China", count: 2 }] : { center: { latitude: 31, longitude: 119 }, markers: [] },
        showError: error => { throw error; }
      };
      if (id.includes("utils/globe")) return require(path.join(__dirname, "../miniprogram/utils/globe.js"));
      if (id.includes("region-points")) return require(path.join(__dirname, "../miniprogram/utils/region-points.js"));
      if (id.includes("local-data")) return { changedAt: () => 0 };
      if (id.includes("world.js")) return require(path.join(__dirname, "../miniprogram/assets/data/world.js"));
      if (id.includes("jiangsu.js")) return require(path.join(__dirname, "../miniprogram/assets/data/jiangsu.js"));
      return { createScopedThreejs: () => THREE };
    },
    Page(definition) { page = definition; },
    wx: {
      getWindowInfo: () => ({ pixelRatio: 3 }),
      createSelectorQuery: () => ({ select: () => ({ fields: () => ({ exec: callback => callback([{ node: canvas, width: 300, height: 200 }]) }) }) })
    },
    console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/pages/map/index.js"), "utf8"), sandbox);
  page.setData = update => Object.assign(page.data, update);
  const flushFrames = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  const flushTimers = () => { while (timers.length) timers.shift()(); };
  return { page, stats, frames, flushFrames, flushTimers, images };
}

const touch = (x, y) => ({ touches: [{ pageX: x, pageY: y }] });

test("the globe shows a bare sphere first and caps the canvas resolution", () => {
  const { page, stats, flushFrames, flushTimers } = loadPage();
  page.onReady();
  assert.equal(stats.renderer.pixelRatio, 2);
  assert.equal(stats.renderer.args[0].antialias, false);
  assert.equal(page.data.globeReady, false);
  assert.equal(stats.created.LineSegments || 0, 0, "borders wait until the first frame is on screen");
  flushFrames();
  assert.equal(stats.renders, 1);
  assert.equal(page.data.globeReady, true);
  flushTimers();
  // One grid plus at most four border colour buckets, instead of one object per country ring.
  assert(stats.created.LineSegments <= 5, `created ${stats.created.LineSegments} line objects`);
  assert.equal(stats.created.LineLoop || 0, 0);
});

test("the globe renders only when something changes", async () => {
  const { page, stats, frames, flushFrames, flushTimers } = loadPage();
  page.onReady(); flushFrames(); flushTimers(); flushFrames();
  const settled = stats.renders;
  assert.equal(frames.size, 0, "no frame loop keeps running while the globe is still");
  page.globeTouchStart(touch(0, 0));
  page.globeTouchMove(touch(10, 0));
  page.globeTouchMove(touch(20, 0));
  assert.equal(frames.size, 1, "moves within one frame share a single render");
  flushFrames();
  assert.equal(stats.renders, settled + 1);

  await page.load();
  flushFrames();
  const borders = stats.created.LineSegments;
  await page.load();
  flushFrames();
  assert.equal(stats.created.LineSegments, borders, "unchanged counts do not rebuild the borders");
});

test("the globe stops drawing while drilled down or hidden and resumes on return", async () => {
  const { page, stats, frames, flushFrames, flushTimers } = loadPage();
  page.onReady(); flushFrames(); flushTimers(); flushFrames();
  page.setData({ level: "province", country: "China" });
  await page.load();
  page.globeTouchStart(touch(0, 0));
  page.globeTouchMove(touch(30, 0));
  assert.equal(frames.size, 0);
  const paused = stats.renders;
  page.setData({ level: "country", country: "" });
  await page.load();
  flushFrames();
  assert(stats.renders > paused);
  page.onHide();
  page.resetGlobe();
  assert.equal(frames.size, 0);
});

test("satellite, water and cloud textures align and settle without a continuous animation", () => {
  const { page, stats, images, frames, flushFrames, flushTimers } = loadPage();
  page.onReady(); flushFrames(); flushTimers(); flushFrames();
  assert.deepEqual(images.map(image => image.src).sort(), ["/assets/images/earth-clouds.jpg", "/assets/images/earth-day.jpg", "/assets/images/earth-water.jpg"]);
  images.forEach(image => image.onload());
  assert.equal(frames.size, 1, "texture callbacks share one render");
  const textures = stats.instances.Texture;
  assert.equal(textures.length, 3);
  assert(textures.every(texture => texture.offset.x === 0.25 && texture.needsUpdate));
  const earth = stats.instances.MeshPhongMaterial[0];
  assert.equal(earth.map.args[0].src, "/assets/images/earth-day.jpg");
  assert.equal(earth.specularMap.args[0].src, "/assets/images/earth-water.jpg");
  const clouds = stats.instances.MeshLambertMaterial[0];
  assert.equal(clouds.map, clouds.alphaMap);
  assert.equal(clouds.map.args[0].src, "/assets/images/earth-clouds.jpg");
  assert.equal(stats.instances.Mesh.find(mesh => mesh.material === clouds).visible, true);
  flushFrames();
  assert.equal(frames.size, 0);
});

test("texture completion while hidden stays paused and unload frees textures exactly once", () => {
  const { page, stats, images, frames, flushFrames, flushTimers } = loadPage();
  page.onReady(); flushFrames(); flushTimers(); flushFrames();
  page.onHide();
  images.forEach(image => image.onload());
  assert.equal(frames.size, 0);
  page.onUnload();
  assert.equal(stats.instances.Texture.length, 3);
  assert(stats.instances.Texture.every(texture => texture.disposeCount === 1));
  const created = stats.created.Texture;
  images.forEach(image => { image.onload(); if (image.onerror) image.onerror(); });
  assert.equal(stats.created.Texture, created, "late callbacks never create resources after unload");
  assert.equal(page.data.globeError, "");
  assert.equal(frames.size, 0);
});

test("failed satellite texture reports an error while optional texture failures retain the globe", () => {
  const { page, stats, images, flushFrames, flushTimers } = loadPage();
  page.onReady(); flushFrames(); flushTimers();
  const day = images.find(image => image.src.endsWith("earth-day.jpg"));
  assert(day, "day texture is requested");
  images.filter(image => image !== day).forEach(image => { if (image.onerror) image.onerror(); });
  assert.equal(page.data.globeError, "");
  const clouds = stats.instances.MeshLambertMaterial[0];
  assert.equal(stats.instances.Mesh.find(mesh => mesh.material === clouds).visible, false, "missing cloud imagery cannot leave a white shell over the earth");
  day.onerror();
  assert.match(page.data.globeError, /地球纹理加载失败/);
});
