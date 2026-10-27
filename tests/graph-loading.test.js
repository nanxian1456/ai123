const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const store = new Map();
let failed = false,
  selectorGood = false;
const local = require("../miniprogram/utils/local-data"),
  graph = require("../miniprogram/utils/graph");
function pageFor(intercept) {
  store.clear();
  failed = false;
  selectorGood = false;
  global.wx = {
    getStorageSync: (k) => structuredClone(store.get(k) || ""),
    setStorageSync: (k, v) => store.set(k, structuredClone(v)),
    removeStorageSync: (k) => store.delete(k),
    getWindowInfo: () => ({ pixelRatio: 2 }),
    createSelectorQuery: () => ({
      select() {
        return this;
      },
      fields() {
        return this;
      },
      exec(cb) {
        cb(
          selectorGood
            ? [
                {
                  node: { getContext: () => ({ scale() {} }) },
                  width: 360,
                  height: 640,
                  left: 0,
                  top: 0,
                },
              ]
            : [],
        );
      },
    }),
  };
  const owner = "graph-loading-fixture";
  local.migrate(owner, {
    ownerId: owner,
    profile: { nickname: "加载测试" },
    contacts: [],
    relationships: [],
  });
  store.set("ai-network-owner-id", owner);
  let p;
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../miniprogram/pages/graph/index.js"),
      "utf8",
    ),
    {
      Page: (v) => (p = v),
      require: (id) =>
        id.endsWith("/api")
          ? {
              request: (route) => {
                const result = intercept && intercept(route);
                return (
                  result ||
                  (failed
                    ? Promise.reject(new Error("fixture read unavailable"))
                    : Promise.resolve(local.handle(owner, route)))
                );
              },
              showError() {},
            }
          : graph,
      wx: global.wx,
      Error,
      setTimeout,
      clearTimeout,
    },
  );
  p.data = structuredClone(p.data);
  p.setData = (u) => Object.assign(p.data, u);
  p.cssW = 360;
  p.cssH = 640;
  p.render = () => {};
  return p;
}
test("early graph touch and tools are harmless while graph data is absent", () => {
  const p = pageFor();
  for (const fn of [
    () => p.hitNode(0, 0),
    () => p.hitEdge(0, 0),
    () => p.openSheet({ currentTarget: { dataset: { sheet: "rank" } } }),
    () => p.fitView(),
    () => p.resetView(),
    () => {
      p.data.mode = "network";
      p.switchMode({ currentTarget: { dataset: { mode: "tree" } } });
    },
  ])
    assert.doesNotThrow(fn);
  assert.equal(p.data.selected, null);
});
test("failed graph loading offers an explicit retry that can recover", async () => {
  const p = pageFor();
  failed = true;
  await p.loadAll();
  assert.equal(p.data.loading, false);
  assert.match(p.data.loadError, /fixture|失败/);
  assert.equal(typeof p.retryGraph, "function");
  failed = false;
  p.canvasReady = true;
  p.canvas = {};
  p.ctx = {};
  await p.retryGraph();
  assert.equal(p.data.loadError, "");
  assert.ok(p.treeGraph);
  assert.ok(p.networkGraph);
});
test("a failed refresh removes the previously interactive graph and its selection", async () => {
  const p = pageFor();
  await p.loadAll();
  p.setData({ selected: { id: "fixture" }, sheet: "detail" });
  failed = true;
  await p.loadAll();
  assert.equal(p.networkGraph, null);
  assert.equal(p.treeGraph, null);
  assert.equal(p.data.selected, null);
  assert.equal(p.data.sheet, "");
  assert.doesNotThrow(() => p.hitNode(0, 0));
});
test("an unavailable canvas gets a visible error and can be initialized again", async () => {
  const p = pageFor();
  p.pendingLoad = true;
  await p.initCanvas();
  assert.equal(p.canvasReady, false);
  assert.ok(p.data.canvasError);
  assert.equal(p.data.loading, false);
  selectorGood = true;
  assert.equal(typeof p.retryGraph, "function");
  await p.retryGraph();
  assert.equal(p.canvasReady, true);
  assert.equal(p.data.canvasError, "");
  assert.ok(p.treeGraph);
});

test("network data survives refresh while the canvas is not initialized yet", async () => {
  const p = pageFor();
  local.handle("graph-loading-fixture", "/contacts", "POST", {
    name: "虚构网络节点",
  });
  p.setData({ mode: "network" });
  await p.loadAll();
  assert.equal(p.data.loadError, "");
  assert.equal(p.networkGraph.nodes.length, 1);
});

test("same-owner graph refresh keeps the current diagram interactive without a loading overlay", async () => {
  let hold = false,
    finish;
  const p = pageFor((route) =>
    hold && route === "/contacts"
      ? new Promise((resolve) => {
          finish = () => resolve([]);
        })
      : null,
  );
  await p.loadAll();
  const previous = p.treeGraph;
  hold = true;
  const pending = p.loadAll();
  assert.equal(p.data.loading, false);
  assert.equal(p.canInteract(), true);
  assert.equal(p.treeGraph, previous);
  p.switchMode({ currentTarget: { dataset: { mode: "network" } } });
  assert.equal(p.data.mode, "network");
  finish();
  await pending;
  assert.equal(p.data.loading, false);
  assert.equal(p.treeGraph, previous);
});
