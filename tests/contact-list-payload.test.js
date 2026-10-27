const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const store = new Map();
global.wx = {
  getStorageSync: key => structuredClone(store.get(key) || ""),
  setStorageSync: (key, value) => store.set(key, structuredClone(value)),
  removeStorageSync: key => store.delete(key),
  navigateTo() {}, switchTab() {}, showToast() {}, showModal() {},
};
const local = require("../miniprogram/utils/local-data");
const OWNER = "list-owner";
const surnames = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜";

function seed(count) {
  store.clear();
  local.migrate(OWNER, { ownerId: OWNER, contacts: [], relationships: [] });
  const data = local.read(OWNER);
  data.contacts = Array.from({ length: count }, (_, i) => ({
    id: i + 1, ownerId: OWNER, name: `${surnames[i % surnames.length]}${i}`, organization: "南京邮电大学", position: "教授",
    city: "南京", province: "江苏", country: "中国", phone: `1380000${String(i).padStart(4, "0")}`, email: `p${i}@example.com`,
    note: `第${i}位联系人的备注`.padEnd(400, "。"), address: "南京市鼓楼区某某路 1 号", tags: ["合作", "高校", "专家"],
  }));
  data.nextContactId = count + 1;
  local.write(OWNER, data);
  store.set("ai-network-owner-id", OWNER);
}

function contactsPage() {
  let page;
  const directory = path.join(__dirname, "../miniprogram/pages/contacts");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(directory, "index.js"), "utf8"), {
    module, exports: module.exports, wx: global.wx, console, setTimeout: callback => callback(), clearTimeout,
    Page(value) { page = value; }, require(id) { return require(path.resolve(directory, id)); },
  });
  page.data = structuredClone(page.data);
  page.payloads = [];
  page.setData = update => {
    page.payloads.push(Buffer.byteLength(JSON.stringify(update), "utf8"));
    for (const [key, value] of Object.entries(update)) {
      const match = key.match(/^sections\[(\d+)\]$/);
      if (match) {
        assert.equal(Number(match[1]), page.data.sections.length, "sections are appended in order");
        page.data.sections.push(value);
      } else page.data[key] = value;
    }
  };
  return page;
}

test("the contacts list never sends notes, phones or a second copy of every contact to the view", async () => {
  seed(1500);
  const page = contactsPage();
  await page.loadContacts();
  assert.equal(page.data.total, 1500);
  assert.equal(page.data.contacts, undefined);
  const payload = JSON.stringify(page.data);
  assert.doesNotMatch(payload, /备注|13800|example\.com|鼓楼区/);
  assert.ok(Math.max(...page.payloads) < 100 * 1024, `largest setData was ${Math.max(...page.payloads)} bytes`);
  const rendered = page.data.sections.reduce((sum, section) => sum + section.contacts.length, 0);
  assert.ok(rendered < 1500, "only the first sections are rendered at once");
});

test("scrolling and the letter index render the remaining sections without resending earlier ones", async () => {
  seed(1500);
  const page = contactsPage();
  await page.loadContacts();
  const before = page.data.sections.length;
  page.onListBottom();
  assert.ok(page.data.sections.length > before);
  const lastLetter = page.data.letters.filter(item => item.available).pop().letter;
  page.jumpLetter({ currentTarget: { dataset: { letter: lastLetter } } });
  assert.ok(page.data.sections.some(section => section.first && section.letter === lastLetter));
  assert.equal(page.data.scrollIntoView, `letter-${lastLetter}`);
  const total = page.data.sections.reduce((sum, section) => sum + section.contacts.length, 0);
  assert.ok(total <= 1500);
  assert.ok(Math.max(...page.payloads) < 100 * 1024);
});

test("keyword search also matches tags, notes, phone, e-mail and address", () => {
  seed(3);
  const find = keyword => local.handle(OWNER, `/contacts/directory?keyword=${encodeURIComponent(keyword)}`).map(item => item.id);
  assert.deepEqual(find("第1位联系人"), [2]);
  assert.deepEqual(find("13800000002"), [3]);
  assert.deepEqual(find("P0@EXAMPLE"), [1]);
  assert.equal(find("鼓楼区").length, 3);
  assert.equal(find("专家").length, 3);
  assert.equal(find("不存在的内容").length, 0);
});
