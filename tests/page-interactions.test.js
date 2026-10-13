const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createPage(name, request, syncPublishedProfile) {
  let definition;
  const calls = [];
  const wx = {
    showToast() {},
    navigateBack() {},
    switchTab() {},
    makePhoneCall(value) {
      calls.push(value);
    },
  };
  const runtimeModule = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, `../miniprogram/pages/${name}/index.js`),
      "utf8",
    ),
    {
      module: runtimeModule,
      exports: runtimeModule.exports,
      Page(value) {
        definition = value;
      },
      wx,
      setTimeout() {},
      require() {
        return { request, syncPublishedProfile, showError() {} };
      },
    },
  );
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(values) {
      for (const [key, value] of Object.entries(values)) {
        if (key.startsWith("form.")) this.data.form[key.slice(5)] = value;
        else if (key.startsWith("profile."))
          this.data.profile[key.slice(8)] = value;
        else this.data[key] = value;
      }
    },
  };
  return { page, calls };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("contact detail refreshes edited name and phone on return", async () => {
  let contact = { id: 7, name: "Before", phone: "100" };
  const { page, calls } = createPage("contact-detail", (route) =>
    Promise.resolve(route.endsWith("relationships") ? [] : { ...contact }),
  );
  page.onLoad({ id: "7" });
  await flush();
  contact = { id: 7, name: "After", phone: "200" };
  page.onShow();
  await flush();
  assert.equal(page.data.contact.name, "After");
  page.call();
  assert.equal(calls[0].phoneNumber, "200");
});

test("relationship repeated save taps issue one mutation until navigation", async () => {
  let finish;
  let mutations = 0;
  const { page } = createPage("relationship-form", () => {
    mutations++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  page.data.contacts = [{ id: 2 }];
  page.data.sourceId = 1;
  page.save();
  page.save();
  assert.equal(mutations, 1);
  finish({});
  await flush();
  page.save();
  assert.equal(mutations, 1);
});

test("profile editing blocks input and save during initial load", async () => {
  let finish;
  let mutations = 0;
  const { page } = createPage("profile-setup", (route, method) => {
    if (method === "PATCH") {
      mutations++;
      return Promise.resolve({});
    }
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  page.onLoad({ mode: "edit" });
  page.input({
    currentTarget: { dataset: { field: "nickname" } },
    detail: { value: "During load" },
  });
  page.save();
  assert.equal(mutations, 0);
  assert.equal(page.data.form.nickname, "");
  finish({ nickname: "Loaded" });
  await flush();
  assert.equal(page.data.form.nickname, "Loaded");
  page.save();
  page.save();
  await flush();
  page.save();
  assert.equal(mutations, 1);
});

test("privacy retry refreshes confirmed publication status after syncing", async () => {
  let profile = {
    nickname: "Name",
    visibility: { nickname: false },
    publicationStatus: "pending",
  };
  const { page } = createPage(
    "settings-privacy",
    () => Promise.resolve({ ...profile }),
    async () => {
      profile.publicationStatus = "synced";
    },
  );
  page.onShow();
  await flush();
  assert.equal(page.data.profile.publicationStatus, "pending");
  await page.retryPublication();
  await flush();
  assert.equal(page.data.profile.publicationStatus, "synced");
});

test("friends refreshes pending status after failed publication", async () => {
  const profile = {
    visibility: { nickname: true },
    publicationStatus: "synced",
  };
  const { page } = createPage(
    "settings-friends",
    (route) =>
      Promise.resolve(
        route.endsWith("import-code") ? "123AB456" : { ...profile },
      ),
    async () => {
      profile.publicationStatus = "pending";
      throw new Error("lost response");
    },
  );
  page.onShow();
  await flush();
  page.publish();
  await flush();
  await flush();
  assert.equal(page.data.profile.publicationStatus, "pending");
});
