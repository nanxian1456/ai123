const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const pageSource = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/contact-form/index.js"), "utf8");

function createPage(request) {
  const calls = { requests: [], toasts: [], scrolls: [], modals: [], navigations: 0 };
  let definition;
  const wx = {
    showToast: options => calls.toasts.push(options),
    showModal: options => calls.modals.push(options),
    pageScrollTo: options => calls.scrolls.push(options),
    navigateBack: () => { calls.navigations += 1; }
  };
  vm.runInNewContext(pageSource, {
    require: moduleId => moduleId.includes("duplicates") ? require("../miniprogram/utils/duplicates") : moduleId.includes("contact-tags") ? require("../miniprogram/utils/contact-tags") : ({
      request: (...args) => { calls.requests.push(args); return request(...args); },
      showError: error => calls.toasts.push({ title: error.message, icon: "none" })
    }),
    Page: value => { definition = value; },
    wx,
    setTimeout: callback => callback()
  });
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(values) {
      for (const [key, value] of Object.entries(values)) {
        if (key.startsWith("form.")) this.data.form[key.slice(5)] = value;
        else this.data[key] = value;
      }
    }
  };
  return { page, calls };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test("AI result is reviewed before filling all empty contact fields", async () => {
  const data = {
    name: "张三", organization: "南京大学", position: "教师", province: "江苏",
    city: "南京", phone: "12345678901", email: "zhang@example.com",
    note: "研究无线感知", tags: ["校友", "研究"]
  };
  const { page, calls } = createPage(() => Promise.resolve({ data }));
  page.data.form.name = "手动填写的姓名";
  page.data.form.tagsText = "校友，合作";
  page.aiInput({ detail: { value: "张三在南京大学工作" } });
  page.extract();
  await flush();

  assert.equal(page.data.aiFields.length, 9);
  assert.equal(page.data.form.organization, "");
  page.applyAiDraft();
  assert.equal(page.data.form.name, "手动填写的姓名");
  assert.equal(page.data.form.organization, "南京大学");
  assert.equal(page.data.form.province, "江苏");
  assert.equal(page.data.form.phone, "12345678901");
  assert.equal(page.data.form.email, "zhang@example.com");
  assert.equal(page.data.form.note, "研究无线感知");
  assert.equal(page.data.form.tagsText, "校友，合作，研究");
  assert.equal(calls.scrolls[0].selector, "#contact-form");
});

test("editing source text discards an in-flight AI result", async () => {
  let complete;
  const { page } = createPage(() => new Promise(resolve => { complete = resolve; }));
  page.aiInput({ detail: { value: "旧介绍" } });
  page.extract();
  page.aiInput({ detail: { value: "新介绍" } });
  complete({ data: { name: "旧姓名" } });
  await flush();

  assert.equal(page.data.aiDraft, null);
  assert.equal(page.data.aiFields.length, 0);
});

test("saving uses the full payload and ignores repeated taps", async () => {
  let complete;
  const { page, calls } = createPage(path => path === "/contacts" && calls.requests.length === 1 ? Promise.resolve([]) : new Promise(resolve => { complete = resolve; }));
  Object.assign(page.data.form, { name: " 张三 ", province: "江苏", tagsText: "校友，合作" });
  page.save();
  page.save();

  await flush();
  assert.equal(calls.requests.length, 2);
  assert.equal(calls.requests[1][0], "/contacts");
  assert.equal(calls.requests[1][2].name, "张三");
  assert.equal(calls.requests[1][2].province, "江苏");
  assert.deepEqual(Array.from(calls.requests[1][2].tags), ["校友", "合作"]);
  assert.equal(page.data.saving, true);
  complete({});
  await flush();
  assert.equal(calls.navigations, 1);
});

test("duplicate contact requires confirmation before saving", async () => {
  const { page, calls } = createPage(() => Promise.resolve([{ id: 1, name: "张三", organization: "学校" }]));
  page.data.form.name = "张三";
  page.data.form.organization = "学校";
  page.save();
  await flush();
  assert.equal(calls.requests.length, 1);
  assert.equal(calls.requests[0][0], "/contacts");
  assert.equal(calls.modals.length, 1);
  calls.modals[0].success({ confirm: false });
  await flush();
  assert.equal(page.data.saving, false);
});

test("suggested tags can be added and removed without replacing custom tags", () => {
  const { page } = createPage(() => Promise.resolve([]));
  page.input({ currentTarget: { dataset: { field: "tagsText" } }, detail: { value: "校友" } });
  page.toggleSuggestedTag({ currentTarget: { dataset: { tag: "人工智能" } } });
  assert.equal(page.data.form.tagsText, "校友，人工智能");
  assert.equal(page.data.suggestedTags.find(item => item.name === "人工智能").selected, true);
  page.toggleSuggestedTag({ currentTarget: { dataset: { tag: "人工智能" } } });
  assert.equal(page.data.form.tagsText, "校友");
});

test("custom school and department tags can be added and removed", () => {
  const { page } = createPage(() => Promise.resolve([]));
  page.onCustomTagInput({ detail: { value: "南京大学计算机学院" } });
  page.addCustomTag();
  assert.deepEqual(Array.from(page.data.selectedTags), ["南京大学计算机学院"]);
  assert.equal(page.data.customTagInput, "");
  page.onCustomTagInput({ detail: { value: "南京大学计算机学院" } });
  page.addCustomTag();
  assert.equal(page.data.selectedTags.length, 1);
  page.removeTag({ currentTarget: { dataset: { tag: "南京大学计算机学院" } } });
  assert.equal(page.data.form.tagsText, "");
});

test("custom tag validation prevents overlong labels and too many tags", () => {
  const { page, calls } = createPage(() => Promise.resolve([]));
  page.onCustomTagInput({ detail: { value: "超过二十个字的院系名称超过二十个字的院系名称" } });
  page.addCustomTag();
  assert.equal(page.data.selectedTags.length, 0);
  assert.match(calls.toasts[0].title, /不超过20字/);
  page.data.form.tagsText = Array.from({ length: 10 }, (_, index) => `标签${index}`).join("，");
  page.onCustomTagInput({ detail: { value: "新院系" } });
  page.addCustomTag();
  assert.equal(page.data.customTagInput, "新院系");
});

test("saving includes a custom tag still in the input", async () => {
  const { page, calls } = createPage(() => Promise.resolve([]));
  page.data.form.name = "王老师";
  page.onCustomTagInput({ detail: { value: "南京大学" } });
  page.save();
  await flush();
  assert.deepEqual(Array.from(calls.requests[1][2].tags), ["南京大学"]);
});
