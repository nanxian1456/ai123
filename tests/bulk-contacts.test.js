const assert = require("node:assert/strict");
const test = require("node:test");
const { parse } = require("../miniprogram/utils/bulk-contacts");

test("bulk preview marks duplicates and preserves empty columns", () => {
  const entries = parse("张三 | 学校 | 教师 | 南京 | 13800000000\n李四 | | | 上海 |", [{ id: 1, name: "张三", organization: "学校" }]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].duplicate, true);
  assert.equal(entries[0].selected, false);
  assert.equal(entries[1].selected, true);
  assert.equal(entries[1].organization, "");
});

test("bulk preview rejects malformed rows", () => {
  assert.throws(() => parse("张三,学校", []), /第1行格式有误/);
});
