const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("every registered mini program page has runtime files", () => {
  const root = path.join(__dirname, "../miniprogram");
  const config = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  for (const page of config.pages) {
    for (const extension of ["js", "json", "wxml"]) {
      assert.ok(fs.existsSync(path.join(root, `${page}.${extension}`)), `${page}.${extension} is missing`);
    }
  }
});
