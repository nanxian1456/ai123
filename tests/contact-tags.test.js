const assert = require("node:assert/strict");
const test = require("node:test");
const { filterTags, splitTags, suggestedTagOptions } = require("../miniprogram/utils/contact-tags");

test("suggested filters stay visible before any contacts exist", () => {
  assert.deepEqual(filterTags([]).map(item => item.name), ["院长", "青年人才", "企业联系人", "人工智能", "产学合作"]);
});

test("existing counts and custom labels appear once", () => {
  const tags = filterTags([{ name: "人工智能", count: 2 }, { name: "校友", count: 3 }]);
  assert.equal(tags.find(item => item.name === "人工智能").count, 2);
  assert.equal(tags.filter(item => item.name === "人工智能").length, 1);
  assert.equal(tags.at(-1).name, "校友");
  assert.deepEqual(splitTags("校友，人工智能, 校友"), ["校友", "人工智能", "校友"]);
  assert.equal(suggestedTagOptions("校友，人工智能").find(item => item.name === "人工智能").selected, true);
});
