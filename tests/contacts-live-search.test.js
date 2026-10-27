const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const store = new Map();
global.wx = {
  getStorageSync: (k) => structuredClone(store.get(k) || ""),
  setStorageSync: (k, v) => store.set(k, structuredClone(v)),
  removeStorageSync: (k) => store.delete(k),
  showToast() {},
  showModal() {},
  navigateTo() {},
  switchTab() {},
};
const local = require("../miniprogram/utils/local-data"),
  api = require("../miniprogram/utils/api");
const A = "live-search-a",
  B = "live-search-b";
function seed() {
  store.clear();
  for (const ownerId of [A, B])
    local.migrate(ownerId, { ownerId, contacts: [], relationships: [] });
  local.handle(A, "/contacts", "POST", {
    name: "甲同学",
    organization: "测试学校",
    phone: "13800138000",
    note: "alpha项目",
    country: "中国",
    province: "江苏",
    city: "南京",
    tags: ["合作"],
  });
  local.handle(A, "/contacts", "POST", {
    name: "乙同学",
    phone: "13900139000",
    note: "beta项目",
    country: "中国",
    province: "江苏",
    city: "苏州",
    tags: ["合作"],
  });
  local.handle(A, "/contacts", "POST", {
    name: "丙老师",
    phone: "13700137000",
    country: "中国",
    province: "江苏",
    city: "南京",
    tags: ["其他"],
  });
  local.handle(B, "/contacts", "POST", { name: "另一个账号" });
  store.set("ai-network-owner-id", A);
}
function fixture(request = api.request) {
  seed();
  let p,
    id = 0;
  const scheduled = new Map(),
    all = new Map(),
    calls = [],
    errors = [];
  const directory = path.join(__dirname, "../miniprogram/pages/contacts");
  const module = { exports: {} };
  // Compile the maintenance source in memory so these deterministic tests never rebuild a colleague's working files.
  const code = ts.transpileModule(
    fs.readFileSync(path.join(directory, "index.ts"), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    wx: global.wx,
    Error,
    console,
    Page: (v) => (p = v),
    setTimeout: (fn) => {
      scheduled.set(++id, fn);
      all.set(id, fn);
      return id;
    },
    clearTimeout: (key) => scheduled.delete(key),
    require: (rel) =>
      rel.endsWith("/api")
        ? {
            ...api,
            request: (...args) => {
              calls.push(args);
              return request(...args);
            },
            showError: (e) => errors.push(e),
          }
        : require(path.resolve(directory, rel)),
  });
  p.data = structuredClone(p.data);
  p.setData = (u) => {
    for (const [k, v] of Object.entries(u)) {
      const m = k.match(/^sections\[(\d+)\]$/);
      if (m) p.data.sections[Number(m[1])] = v;
      else p.data[k] = v;
    }
  };
  return {
    p,
    calls,
    errors,
    scheduled,
    all,
    run: () => {
      for (const [key, fn] of [...scheduled]) {
        scheduled.delete(key);
        fn();
      }
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const input = (p, value) => p.onKeyword({ detail: { value } });
test("typing filters local contacts without pressing the search button", async () => {
  const { p, run } = fixture();
  await p.loadContacts();
  input(p, "138001");
  run();
  await flush();
  assert.equal(p.data.total, 1);
  assert.equal(p.contactList[0].name, "甲同学");
});
test("rapid inputs issue only one query for the latest keyword", async () => {
  const { p, run, calls } = fixture();
  input(p, "乙");
  input(p, "乙同");
  input(p, "乙同学");
  assert.equal(calls.length, 0);
  run();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(p.contactList[0].name, "乙同学");
});
test("clearing the input restores all contacts immediately and cancels a pending keyword", async () => {
  const { p, run } = fixture();
  await p.loadContacts();
  input(p, "乙");
  await input(p, "");
  await flush();
  assert.equal(p.data.total, 3);
  run();
  await flush();
  assert.equal(p.data.keyword, "");
  assert.equal(p.data.total, 3);
});
test("confirm search flushes debounce and does not query a second time later", async () => {
  const { p, run, calls } = fixture();
  input(p, "alpha");
  await p.search();
  await flush();
  assert.equal(p.data.total, 1);
  const count = calls.length;
  run();
  await flush();
  assert.equal(calls.length, count);
});
test("a previous response arriving during debounce cannot replace the latest search state", async () => {
  let finish;
  const { p, run } = fixture((route, ...args) =>
    new URL(route, "https://test.invalid").searchParams.get("keyword") === "甲"
      ? new Promise((resolve) => {
          finish = () => resolve(local.handle(A, route));
        })
      : api.request(route, ...args),
  );
  p.setData({ keyword: "甲" });
  const old = p.loadContacts();
  input(p, "乙");
  finish();
  await old;
  assert.equal(p.data.total, 0);
  assert.equal(p.data.searchPending, true);
  run();
  await flush();
  assert.equal(p.contactList[0].name, "乙同学");
});
test("hiding or unloading cancels debounce and ignores already queued callbacks", async () => {
  for (const lifecycle of ["onHide", "onUnload"]) {
    const { p, run, calls, all } = fixture();
    input(p, "乙");
    assert.equal(typeof p[lifecycle], "function");
    p[lifecycle]();
    run();
    for (const fn of all.values()) fn();
    await flush();
    assert.equal(calls.length, 0);
    assert.equal(p.data.searchPending, false);
  }
});
test("late directory data cannot expose the previous account after switching owner", async () => {
  let finish;
  const { p } = fixture(
    (route) =>
      new Promise((resolve) => {
        finish = () => resolve(local.handle(A, route));
      }),
  );
  const old = p.loadContacts();
  store.set("ai-network-owner-id", B);
  finish();
  await old;
  assert.equal(p.data.sections.length, 0);
  assert.equal(p.contactList.length, 0);
  assert.match(p.data.loadError, /账号/);
});
test("live keywords preserve the active tag and region filters", async () => {
  const { p, run } = fixture();
  p.setData({
    selectedTag: "合作",
    regionFilter: true,
    country: "中国",
    province: "江苏",
    city: "南京",
  });
  input(p, "alpha");
  run();
  await flush();
  assert.equal(p.data.total, 1);
  assert.equal(p.contactList[0].name, "甲同学");
  assert.equal(p.data.selectedTag, "合作");
  assert.equal(p.data.city, "南京");
});

test("a tag creation dialog cannot create a label for a different owner", async () => {
  const { p } = fixture();
  await p.loadContacts();
  let modal;
  wx.showModal = (o) => (modal = o);
  p.createTag();
  store.set("ai-network-owner-id", B);
  await modal.success({ confirm: true, content: "不能跨账号创建的标签" });
  await flush();
  assert.equal(
    local.handle(A, "/tags").some((tag) => tag.name === "不能跨账号创建的标签"),
    false,
  );
  assert.equal(
    local.handle(B, "/tags").some((tag) => tag.name === "不能跨账号创建的标签"),
    false,
  );
  assert.equal(p.contactList.length, 0);
});

test("a tag request finishing while hidden does not leave creation permanently disabled", async () => {
  let finish;
  const { p } = fixture((route, method, body) =>
    route === "/tags" && method === "POST"
      ? new Promise((resolve) => {
          finish = () => resolve(local.handle(A, route, method, body));
        })
      : api.request(route, method, body),
  );
  await p.loadContacts();
  let modal;
  wx.showModal = (o) => (modal = o);
  p.createTag();
  const pending = modal.success({ confirm: true, content: "本账号标签" });
  assert.equal(p.data.creatingTag, true);
  p.onHide();
  finish();
  await pending;
  await p.onShow();
  assert.equal(p.data.creatingTag, false);
});
