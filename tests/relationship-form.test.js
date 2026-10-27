const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const store = new Map();
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key)
};
const local = require("../miniprogram/utils/local-data");
const owner = "relationship-owner";

function seed() {
  store.clear();
  store.set("ai-network-owner-id", owner);
  local.migrate(owner, { ownerId: owner, contacts: [], relationships: [] });
  const add = (name, extra = {}) => local.handle(owner, "/contacts", "POST", { name, ...extra });
  return { a: add("甲"), b: add("乙", { organization: "南邮", phone: "13800001111" }), c: add("丙", { city: "苏州" }) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function formPage(query, { hold = () => false } = {}) {
  let page;
  const held = [];
  const navigation = { back: 0, title: "" };
  const runtimeModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/pages/relationship-form/index.js"), "utf8"), {
    module: runtimeModule, exports: runtimeModule.exports, setTimeout: callback => callback(),
    require(id) {
      if (id.endsWith("/api")) return { request: async (route, method, body) => {
        const result = structuredClone(local.handle(store.get("ai-network-owner-id"), route, method, body));
        if (hold(route)) await new Promise(resolve => held.push(resolve));
        return result;
      }, showError(error) { throw error; } };
      if (id.endsWith("/contact-search")) return require("../miniprogram/utils/contact-search");
      throw new Error(id);
    },
    Page(value) { page = value; },
    wx: { getStorageSync: global.wx.getStorageSync, navigateBack() { navigation.back++; }, setNavigationBarTitle(options) { navigation.title = options.title; }, showToast() {} }
  });
  page.data = structuredClone(page.data);
  page.setData = update => Object.assign(page.data, update);
  return { page, navigation, ready: page.onLoad(query), release() { held.splice(0).forEach(resolve => resolve()); } };
}
const names = list => Array.from(list, item => item.name);

test("the same pair and type is one relationship whatever the note or direction", () => {
  const { a, b, c } = seed();
  local.handle(owner, "/relationships", "POST", { sourceId: a.id, targetId: b.id, type: "合作", note: "项目一" });
  assert.throws(() => local.handle(owner, "/relationships", "POST", { sourceId: a.id, targetId: b.id, type: "合作", note: "项目二" }), /已存在/);
  assert.throws(() => local.handle(owner, "/relationships", "POST", { sourceId: b.id, targetId: a.id, type: "合作" }), /已存在/);
  // A directional type seen from the other side is the same relationship.
  local.handle(owner, "/relationships", "POST", { sourceId: a.id, targetId: c.id, type: "指导" });
  assert.throws(() => local.handle(owner, "/relationships", "POST", { sourceId: c.id, targetId: a.id, type: "导师" }), /已存在/);
  // A different type between the same people is still allowed.
  local.handle(owner, "/relationships", "POST", { sourceId: a.id, targetId: b.id, type: "同学" });
  assert.equal(local.handle(owner, "/relationships").length, 3);
});

test("a relationship can be edited and re-oriented without creating a duplicate", () => {
  const { a, b, c } = seed();
  const first = local.handle(owner, "/relationships", "POST", { sourceId: a.id, targetId: b.id, type: "指导", note: "论文" });
  local.handle(owner, "/relationships", "POST", { sourceId: a.id, targetId: c.id, type: "朋友" });
  // Edited from 乙's side: 乙 sees 甲 as 导师, and keeps that meaning with a new note.
  local.handle(owner, `/relationships/${first.id}`, "PATCH", { sourceId: b.id, targetId: a.id, type: "导师", note: "毕业设计" });
  const fromA = local.handle(owner, `/contacts/${a.id}/relationships`).find(item => item.id === first.id);
  assert.equal(fromA.label, "指导");
  assert.equal(fromA.note, "毕业设计");
  assert.throws(() => local.handle(owner, `/relationships/${first.id}`, "PATCH", { sourceId: a.id, targetId: c.id, type: "朋友" }), /已存在/);
  assert.throws(() => local.handle(owner, "/relationships/999", "PATCH", { sourceId: a.id, targetId: b.id, type: "合作" }), /关系不存在/);
  assert.equal(local.handle(owner, "/relationships").length, 2);
});

test("the person picker searches every contact field and needs an explicit choice", async () => {
  const { a, b } = seed();
  const { page, ready } = formPage({ sourceId: String(a.id) });
  await ready;
  assert.deepEqual(names(page.data.results), ["乙", "丙"]);
  page.onKeyword({ detail: { value: "13800001111" } });
  assert.deepEqual(names(page.data.results), ["乙"]);
  page.onKeyword({ detail: { value: "苏州" } });
  assert.deepEqual(names(page.data.results), ["丙"]);
  await page.save();
  assert.equal(local.handle(owner, "/relationships").length, 0, "nothing is saved before a person is chosen");
  page.chooseTarget({ currentTarget: { dataset: { id: String(b.id) } } });
  assert.equal(page.data.targetName, "乙");
  assert.equal(page.data.targetMeta, "南邮");
  await page.save();
  assert.deepEqual(local.handle(owner, "/relationships").map(item => [item.sourceId, item.targetId, item.type]), [[a.id, b.id, "合作"]]);
});

test("a long contact list renders a limited set of matches", async () => {
  store.clear();
  store.set("ai-network-owner-id", owner);
  local.migrate(owner, { ownerId: owner, contacts: [], relationships: [] });
  const contacts = Array.from({ length: 80 }, (_, index) => ({ name: `联系人${index}` }));
  const created = local.handle(owner, "/contacts/batch", "POST", contacts);
  const { page, ready } = formPage({ sourceId: String(created[0].id) });
  await ready;
  assert.equal(page.data.results.length, 50);
  assert.equal(page.data.moreCount, 29);
});

test("editing opens from the viewer's side and saves the change", async () => {
  const { a, b, c } = seed();
  const existing = local.handle(owner, "/relationships", "POST", { sourceId: a.id, targetId: b.id, type: "指导", note: "论文" });
  const { page, navigation, ready } = formPage({ sourceId: String(b.id), id: String(existing.id) });
  await ready;
  assert.equal(navigation.title, "编辑关系");
  assert.equal(page.data.targetName, "甲");
  assert.equal(page.data.typeName, "导师");
  assert.equal(page.data.note, "论文");
  page.clearTarget();
  page.chooseTarget({ currentTarget: { dataset: { id: String(c.id) } } });
  page.noteInput({ detail: { value: "换了导师" } });
  await page.save();
  await flush();
  assert.equal(navigation.back, 1);
  const saved = local.handle(owner, `/relationships/${existing.id}`);
  assert.deepEqual([saved.sourceId, saved.targetId, saved.type, saved.note], [b.id, c.id, "导师", "换了导师"]);
  assert.equal(local.handle(owner, "/relationships").length, 1);
});

test("the contact detail page offers editing for each relationship", () => {
  const markup = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/contact-detail/index.wxml"), "utf8");
  assert.match(markup, /bindtap="editRelationship">编辑</);
  const source = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/contact-detail/index.ts"), "utf8");
  assert.match(source, /relationship-form\/index\?sourceId=\$\{this\.data\.contact\.id\}&id=/);
});

test("an old relationship form cannot overwrite the same relationship id in another account", async () => {
  const { a, b } = seed();
  const relation = local.handle(owner, "/relationships", "POST", { sourceId: a.id, targetId: b.id, type: "朋友", note: "A的备注" });
  const other = "relationship-other-owner";
  local.migrate(other, { ownerId: other, contacts: [{ id: 1, name: "B甲" }, { id: 2, name: "B乙" }], relationships: [] });
  const original = local.handle(other, "/relationships", "POST", { sourceId: 1, targetId: 2, type: "同事", note: "B的备注" });
  const { page, ready } = formPage({ sourceId: String(a.id), id: String(relation.id) });
  await ready;
  store.set("ai-network-owner-id", other);
  page.noteInput({ detail: { value: "旧表单" } });
  await page.save();
  assert.deepEqual(local.handle(other, `/relationships/${original.id}`), original);
  assert.equal(page.data.source, null);
  assert.equal(page.data.note, "");
  assert.match(page.data.loadError, /账号/);
});

test("contacts loaded for an old account cannot populate the relationship form", async () => {
  const { a } = seed();
  const form = formPage({ sourceId: String(a.id) }, { hold: route => route === "/contacts" });
  store.set("ai-network-owner-id", "another-owner");
  form.release(); await form.ready;
  assert.equal(form.page.data.source, null);
  assert.equal(form.page.data.results.length, 0);
  assert.equal(form.page.candidates.length, 0);
  assert.match(form.page.data.loadError, /账号/);
});

test("hiding a relationship form blocks writes until the same account returns", async () => {
  const { a, b } = seed();
  const form = formPage({ sourceId: String(a.id) });
  await form.ready;
  form.page.chooseTarget({ currentTarget: { dataset: { id: String(b.id) } } });
  form.page.onHide?.();
  await form.page.save();
  assert.equal(local.handle(owner, "/relationships").length, 0);
  form.page.onShow?.();
  await form.page.save();
  assert.equal(local.handle(owner, "/relationships").length, 1);
});

test("a hidden form ignores its pending read and reloads on returning to the same account", async () => {
  const { a } = seed();
  const form = formPage({ sourceId: String(a.id) }, { hold: route => route === "/contacts" });
  form.page.onHide(); form.release(); await form.ready;
  assert.equal(form.page.data.source, null);
  form.page.onShow(); form.release(); await flush();
  assert.equal(form.page.data.source.id, a.id);
  assert.equal(form.page.data.loading, false);
});

test("a relationship save finishing after unload never navigates away from the next page", async () => {
  const { a, b } = seed();
  const form = formPage({ sourceId: String(a.id) }, { hold: route => route === "/relationships" });
  await form.ready;
  form.page.chooseTarget({ currentTarget: { dataset: { id: String(b.id) } } });
  const saving = form.page.save();
  form.page.onUnload(); form.release(); await saving;
  assert.equal(form.navigation.back, 0);
});
