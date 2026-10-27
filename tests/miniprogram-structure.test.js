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

test("global styles do not restyle the .field rows used by the form pages", () => {
  const root = path.join(__dirname, "../miniprogram");
  const styles = fs.readFileSync(path.join(root, "app.wxss"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(styles, /(^|[\s,}])\.field\s*[{,]/, "app.wxss must not define .field");
  for (const page of ["contact-form", "profile-setup", "relationship-form"]) {
    assert.match(fs.readFileSync(path.join(root, `pages/${page}/index.wxml`), "utf8"), /class="field/);
  }
});

test("global styles leave page-specific avatars alone and keep unified colors", () => {
  const root = path.join(__dirname, "../miniprogram");
  const styles = fs.readFileSync(path.join(root, "app.wxss"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(styles, /(^|[\s,}])\.avatar\s*[{,]/, "app.wxss must not define .avatar");
  const old = /#1677d2|#163a63|#7a8494|#f5f8fc/i;
  for (const page of fs.readdirSync(path.join(root, "pages"))) {
    if (page === "entry" || page === "auth") continue; // start pages keep their original look
    const file = path.join(root, "pages", page, "index.wxss");
    if (fs.existsSync(file)) assert.doesNotMatch(fs.readFileSync(file, "utf8"), old, `${page} still uses the old palette`);
  }
});
