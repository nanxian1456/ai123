const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createPage(
  syncError,
  rollbackResult,
  openAsync = async () => ({ contacts: [] }),
) {
  let definition;
  const calls = {
    modals: [],
    rollbacks: [],
    errors: [],
    writes: [],
    fileSelections: [],
  };
  const token = { restored: true };
  const runtimeModule = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../miniprogram/pages/data-backup/index.js"),
      "utf8",
    ),
    {
      module: runtimeModule,
      exports: runtimeModule.exports,
      Page(value) {
        definition = value;
      },
      wx: {
        chooseMessageFile(options) {
          calls.fileSelections.push(options);
        },
        getFileSystemManager() {
          return {
            readFile(options) {
              options.success({ data: "encrypted backup" });
            },
          };
        },
        showModal(value) {
          calls.modals.push(value);
        },
        showToast() {},
      },
      require(id) {
        if (id.endsWith("api"))
          return {
            getCurrentOwnerId: async () => "owner",
            syncPublishedProfile: async () => {
              throw syncError;
            },
            showError(error) {
              calls.errors.push(error);
            },
          };
        if (id.endsWith("local-data"))
          return {
            read: () => ({ profile: { visibility: { nickname: true } } }),
            write(...args) {
              calls.writes.push(args);
            },
          };
        return {
          open: () => ({ contacts: [] }),
          openAsync,
          preview: () => ({ backupContacts: 1 }),
          restore: async () => token,
          rollbackRestore(owner, value) {
            calls.rollbacks.push([owner, value]);
            return rollbackResult;
          },
        };
      },
    },
  );
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(values) {
      Object.assign(this.data, values);
    },
  };
  page.data.pending = { contacts: [] };
  return { page, calls, token };
}

test("restore failure uses conditional rollback and preserves later local edits", async () => {
  const { page, calls, token } = createPage(new Error("rejected"), false);
  page.restoreData();
  await calls.modals[0].success({ confirm: true });
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.rollbacks[0][1], token);
  assert.match(calls.errors[0].message, /保留|更新/);
});

test("backup picker accepts an exported 13MiB backup", () => {
  const { page, calls } = createPage(null, true);
  page.chooseFile();
  calls.fileSelections[0].success({
    tempFiles: [
      {
        name: "large-export.aimap",
        path: "large-export.aimap",
        size: 13 * 1024 * 1024,
      },
    ],
  });
  assert.equal(page.data.selectedPath, "large-export.aimap");
  assert.equal(calls.errors.length, 0);
});

test("backup picker rejects files exceeding 24MiB without replacing selected file", () => {
  const { page, calls } = createPage(null, true);
  page.data.selectedPath = "previous.aimap";
  page.chooseFile();
  calls.fileSelections[0].success({
    tempFiles: [
      {
        name: "oversized.aimap",
        path: "oversized.aimap",
        size: 24 * 1024 * 1024 + 1,
      },
    ],
  });
  assert.equal(page.data.selectedPath, "previous.aimap");
  assert.match(calls.errors[0].message, /24MB/);
});

test("inspection waits for asynchronous key derivation before showing a preview", async () => {
  let finish;
  const incoming = { contacts: [{ id: 1 }] };
  const { page, calls } = createPage(
    null,
    true,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  page.data.selectedPath = "backup.aimap";
  page.data.importPassword = "password for backup";
  const inspecting = page.inspect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.data.busy, true);
  assert.equal(page.data.preview, null);
  assert.equal(page.data.pending, null);
  page.importPasswordInput({ detail: { value: "changed" } });
  assert.equal(page.data.importPassword, "password for backup");
  finish(incoming);
  await inspecting;
  assert.equal(page.data.busy, false);
  assert.equal(page.data.pending, incoming);
  assert.equal(page.data.preview.backupContacts, 1);
  assert.equal(calls.errors.length, 0);
});

test("uncertain publication result retains restored data for retry", async () => {
  const { page, calls } = createPage(
    Object.assign(new Error("pending"), { ambiguous: true }),
    true,
  );
  page.restoreData();
  await calls.modals[0].success({ confirm: true });
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.rollbacks.length, 0);
  assert.equal(page.data.pending, null);
});

test("restore confirmation prevents repeated taps opening multiple destructive dialogs", () => {
  const { page, calls } = createPage(new Error("rejected"), true);
  page.restoreData();
  page.restoreData();
  assert.equal(calls.modals.length, 1);
  calls.modals[0].success({ confirm: false });
  assert.equal(page.data.busy, false);
});
