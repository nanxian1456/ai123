const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const pageSource = fs.readFileSync(
  path.join(__dirname, "../miniprogram/pages/contact-form/index.js"),
  "utf8",
);

function createPage(request, { aiConsent = true } = {}) {
  const calls = {
    requests: [],
    toasts: [],
    scrolls: [],
    modals: [],
    navigations: 0,
  };
  let definition;
  const wx = {
    showToast: (options) => calls.toasts.push(options),
    showModal: (options) => calls.modals.push(options),
    pageScrollTo: (options) => calls.scrolls.push(options),
    navigateBack: () => {
      calls.navigations += 1;
    },
    setNavigationBarTitle: () => {},
  };
  const runtimeModule = { exports: {} };
  vm.runInNewContext(pageSource, {
    module: runtimeModule,
    exports: runtimeModule.exports,
    require: (moduleId) =>
      moduleId.includes("consent")
        ? { confirmAiTransfer: () => Promise.resolve(aiConsent) }
        : moduleId.includes("duplicates")
        ? require("../miniprogram/utils/duplicates")
        : moduleId.includes("contact-tags")
          ? require("../miniprogram/utils/contact-tags")
          : {
              request: (...args) => {
                calls.requests.push(args);
                return request(...args);
              },
              showError: (error) =>
                calls.toasts.push({ title: error.message, icon: "none" }),
            },
    Page: (value) => {
      definition = value;
    },
    wx,
    setTimeout: (callback) => callback(),
  });
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(values) {
      for (const [key, value] of Object.entries(values)) {
        if (key.startsWith("form.")) this.data.form[key.slice(5)] = value;
        else this.data[key] = value;
      }
    },
  };
  return { page, calls };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("creating a contact from a graph branch persists the selected classification", async () => {
  const { page, calls } = createPage(() => Promise.resolve([]));
  page.onLoad({ categoryId: "cat7" });
  page.input({ currentTarget: { dataset: { field: "name" } }, detail: { value: "分支联系人" } });
  await page.save();
  const saved = calls.requests.find(item => item[1] === "POST" && item[0] === "/contacts");
  assert.ok(saved);
  assert.ok(Array.isArray(saved[2].categoryIds));
  assert.deepEqual([...saved[2].categoryIds], ["cat7"]);
});

test("edit identity is set before loading and save is blocked until load succeeds", async () => {
  let complete;
  const { page, calls } = createPage((route) =>
    route === "/tags"
      ? Promise.resolve([])
      : new Promise((resolve) => {
          complete = resolve;
        }),
  );
  page.onLoad({ id: "7" });
  assert.equal(page.data.id, "7");
  page.input({
    currentTarget: { dataset: { field: "name" } },
    detail: { value: "premature edit" },
  });
  page.save();
  await flush();
  assert.equal(calls.requests.filter(item => item[0] !== "/categories").length, 2);
  assert.equal(page.data.form.name, "");
  complete({ name: "Loaded name", tags: [] });
  await flush();
  assert.equal(page.data.form.name, "Loaded name");
  assert.equal(page.data.loading, false);
});

test("a failed edit load cannot save a new or empty contact", async () => {
  const { page, calls } = createPage((route) =>
    route === "/tags"
      ? Promise.resolve([])
      : Promise.reject(new Error("read failed")),
  );
  page.onLoad({ id: "7" });
  await flush();
  page.data.form.name = "manual name";
  page.save();
  await flush();
  assert.equal(calls.requests.filter(item => item[0] !== "/categories").length, 2);
});

test("imported public profile fills only fields still blank when it completes", async () => {
  let complete;
  const { page } = createPage(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  page.data.importCode = "123AB456";
  page.data.form.organization = "Original organization";
  page.importByCode();
  page.input({
    currentTarget: { dataset: { field: "name" } },
    detail: { value: "Typed while importing" },
  });
  complete({
    nickname: "Imported",
    organization: "Other",
    position: "Teacher",
  });
  await flush();
  assert.equal(page.data.form.name, "Typed while importing");
  assert.equal(page.data.form.organization, "Original organization");
  assert.equal(page.data.form.position, "Teacher");
});

test("AI result is reviewed before filling all empty contact fields", async () => {
  const data = {
    name: "张三",
    organization: "南京大学",
    position: "教师",
    province: "江苏",
    city: "南京",
    phone: "12345678901",
    email: "zhang@example.com",
    note: "研究无线感知",
    tags: ["校友", "研究"],
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
  const { page } = createPage(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  page.aiInput({ detail: { value: "旧介绍" } });
  page.extract();
  await flush(); // the AI consent check resolves, then the request is in flight
  page.aiInput({ detail: { value: "新介绍" } });
  complete({ data: { name: "旧姓名" } });
  await flush();

  assert.equal(page.data.aiDraft, null);
  assert.equal(page.data.aiFields.length, 0);
});

test("saving uses the full payload and ignores repeated taps", async () => {
  let complete;
  const { page, calls } = createPage((path) =>
    path === "/contacts" && calls.requests.length === 1
      ? Promise.resolve([])
      : new Promise((resolve) => {
          complete = resolve;
        }),
  );
  Object.assign(page.data.form, {
    name: " 张三 ",
    province: "江苏",
    tagsText: "校友，合作",
  });
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
  const { page, calls } = createPage(() =>
    Promise.resolve([{ id: 1, name: "张三", organization: "学校" }]),
  );
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
  page.input({
    currentTarget: { dataset: { field: "tagsText" } },
    detail: { value: "校友" },
  });
  page.toggleSuggestedTag({ currentTarget: { dataset: { tag: "人工智能" } } });
  assert.equal(page.data.form.tagsText, "校友，人工智能");
  assert.equal(
    page.data.suggestedTags.find((item) => item.name === "人工智能").selected,
    true,
  );
  page.toggleSuggestedTag({ currentTarget: { dataset: { tag: "人工智能" } } });
  assert.equal(page.data.form.tagsText, "校友");
});

test("a custom tag created from the directory can be assigned and removed", async () => {
  const { page, calls } = createPage((route) =>
    Promise.resolve(
      route === "/tags" ? [{ name: "南京大学计算机学院", count: 0 }] : [],
    ),
  );
  page.loadTags();
  await flush();
  assert.equal(page.data.suggestedTags.at(-1).name, "南京大学计算机学院");
  page.toggleSuggestedTag({
    currentTarget: { dataset: { tag: "南京大学计算机学院" } },
  });
  assert.deepEqual(Array.from(page.data.selectedTags), ["南京大学计算机学院"]);
  page.data.form.name = "王老师";
  page.save();
  await flush();
  assert.deepEqual(Array.from(calls.requests.at(-1)[2].tags), [
    "南京大学计算机学院",
  ]);
  page.removeTag({ currentTarget: { dataset: { tag: "南京大学计算机学院" } } });
  assert.equal(page.data.form.tagsText, "");
});

test("a contact opened from a graph category displays the category name", async () => {
  const { page } = createPage(route => Promise.resolve(route === "/categories"
    ? { tree: [{ id: "cat1", name: "大学", children: [{ id: "cat7", name: "同学", children: [] }] }] } : []));
  page.onLoad({ categoryId: "cat7" });
  await flush();
  const selected = page.data.categoryOptions.filter(item => item.selected);
  assert.deepEqual(JSON.parse(JSON.stringify(selected.map(item => item.label))), ["大学 / 同学"]);
});

const CATEGORY_TREE = { tree: [{ id: "cat1", name: "大学", children: [{ id: "cat7", name: "同学", children: [] }] }, { id: "cat2", name: "朋友", children: [] }] };

test("an existing contact can be added to and removed from categories when editing", async () => {
  const { page, calls } = createPage(route =>
    route === "/categories" ? Promise.resolve(CATEGORY_TREE)
      : route === "/contacts/7" ? Promise.resolve({ id: 7, name: "李四", tags: [], categoryIds: ["cat7"] })
        : Promise.resolve([]));
  page.onLoad({ id: "7" });
  await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.categoryOptions.map(item => [item.label, item.selected]))),
    [["大学", false], ["大学 / 同学", true], ["朋友", false]]);
  page.toggleCategory({ currentTarget: { dataset: { id: "cat2" } } });
  page.toggleCategory({ currentTarget: { dataset: { id: "cat7" } } });
  await page.save();
  const saved = calls.requests.find(item => item[0] === "/contacts/7" && item[1] === "PATCH");
  assert.deepEqual([...saved[2].categoryIds], ["cat2"]);
});

test("a contact created without a branch can still be classified", async () => {
  const { page, calls } = createPage(route => Promise.resolve(route === "/categories" ? CATEGORY_TREE : []));
  page.onLoad({});
  await flush();
  page.input({ currentTarget: { dataset: { field: "name" } }, detail: { value: "王五" } });
  page.toggleCategory({ currentTarget: { dataset: { id: "cat1" } } });
  await page.save();
  const saved = calls.requests.find(item => item[0] === "/contacts" && item[1] === "POST");
  assert.deepEqual([...saved[2].categoryIds], ["cat1"]);
});

test("a contact never classified is saved without a categoryIds field", async () => {
  const { page, calls } = createPage(route => Promise.resolve(route === "/categories" ? CATEGORY_TREE : []));
  page.onLoad({});
  await flush();
  page.input({ currentTarget: { dataset: { field: "name" } }, detail: { value: "赵六" } });
  await page.save();
  const saved = calls.requests.find(item => item[0] === "/contacts" && item[1] === "POST");
  assert.equal("categoryIds" in saved[2], false);
});

test("AI extraction sends nothing when the user declines to share text with DeepSeek", async () => {
  const { page, calls } = createPage(() => Promise.resolve({ data: { name: "张三" } }), { aiConsent: false });
  page.aiInput({ detail: { value: "张三，南京邮电大学教授" } });
  await page.extract();
  assert.equal(calls.requests.some((item) => item[0] === "/ai/extract"), false);
  assert.equal(page.data.extracting, false);
});

test("a category deleted after opening the form from the graph is dropped instead of failing the save", async () => {
  let tree = [{ id: "cat7", name: "大学", children: [] }];
  const { page, calls } = createPage((route) => Promise.resolve(route === "/categories" ? { tree } : []));
  page.onLoad({ categoryId: "cat7" });
  await flush();
  assert.deepEqual([...page.data.categoryIds], ["cat7"]);
  tree = [];
  page.input({ currentTarget: { dataset: { field: "name" } }, detail: { value: "分支联系人" } });
  await page.save();
  const saved = calls.requests.find(item => item[1] === "POST" && item[0] === "/contacts");
  assert.ok(saved);
  assert.deepEqual([...saved[2].categoryIds], []);
  assert.ok(calls.toasts.some(item => /原分类已被删除/.test(item.title)));
});

test("a category that no longer exists when the form opens is removed right away", async () => {
  const { page } = createPage((route) => Promise.resolve(route === "/categories" ? { tree: [{ id: "cat1", name: "朋友", children: [] }] } : []));
  page.onLoad({ categoryId: "cat9" });
  await flush();
  assert.deepEqual([...page.data.categoryIds], []);
});
