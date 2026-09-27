const assert = require("node:assert/strict");
const test = require("node:test");
const { findPotentialDuplicates } = require("../miniprogram/utils/duplicates");

test("detects phone, email and same name at the same organization", () => {
  const contacts = [
    { id: 1, name: "张三", organization: "甲公司", phone: "138 0000 0000" },
    { id: 2, name: "李四", organization: "乙公司", email: "li@example.com" }
  ];
  assert.equal(findPotentialDuplicates(contacts, { name: "其他", phone: "13800000000" }).length, 1);
  assert.equal(findPotentialDuplicates(contacts, { name: "其他", email: "LI@example.com" }).length, 1);
  assert.equal(findPotentialDuplicates(contacts, { name: " 张三 ", organization: "甲公司" }).length, 1);
  assert.equal(findPotentialDuplicates(contacts, { name: "张三", organization: "别的公司" }).length, 0);
  assert.equal(findPotentialDuplicates(contacts, { name: "张三", organization: "甲公司" }, 1).length, 0);
});
