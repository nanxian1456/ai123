const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/contacts/index.js"), "utf8");

test("contact filters combine labels with search and return to all contacts", async () => {
  const calls = [];
  let definition;
  vm.runInNewContext(source, {
    require: id => id.includes("contact-tags") ? require("../miniprogram/utils/contact-tags") : {
      request: route => { calls.push(route); return Promise.resolve([]); },
      showError: error => { throw error; }
    },
    Page: value => { definition = value; },
    wx: {},
    setTimeout
  });
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(values) { Object.assign(this.data, values); }
  };
  assert.equal(page.data.tags.length, 5);
  page.data.keyword = "张";
  page.selectTag({ currentTarget: { dataset: { tag: "人工智能" } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[0], "/contacts/directory?keyword=%E5%BC%A0&tag=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD");
  page.selectTag({ currentTarget: { dataset: { tag: "" } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.selectedTag, "");
  assert.equal(calls[1], "/contacts/directory?keyword=%E5%BC%A0");
});

test("custom label button creates a label at the end of the filter bar", async () => {
  const calls = [];
  const modals = [];
  let definition;
  const tags = [];
  vm.runInNewContext(source, {
    require: id => id.includes("contact-tags") ? require("../miniprogram/utils/contact-tags") : {
      request: (route, method, payload) => {
        calls.push({ route, method, payload });
        if (route === "/tags" && method === "POST") { tags.push({ name: payload.name, count: 0 }); return Promise.resolve({ name: payload.name, count: 0 }); }
        return Promise.resolve(route === "/tags" ? tags : []);
      },
      showError: error => { throw error; }
    },
    Page: value => { definition = value; },
    wx: { showModal: options => modals.push(options), showToast: () => {} },
    setTimeout
  });
  const page = { ...definition, data: structuredClone(definition.data), setData(values) { Object.assign(this.data, values); } };
  page.createTag();
  assert.equal(modals[0].editable, true);
  modals[0].success({ confirm: true, content: "南京大学计算机学院" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[0].route, "/tags");
  assert.equal(calls[0].method, "POST");
  assert.equal(page.data.tags.at(-1).name, "南京大学计算机学院");
});
