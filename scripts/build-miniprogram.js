const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "miniprogram");
const output = path.join(root, "work", "miniprogram-build");
const localConfig = path.join(source, "utils", "api-config.local.js");
if (!fs.existsSync(localConfig)) {
  fs.writeFileSync(localConfig, "module.exports = {};\n", "utf8");
}
execFileSync(
  process.execPath,
  [
    require.resolve("typescript/bin/tsc"),
    "-p",
    path.join(source, "tsconfig.json"),
    "--outDir",
    output,
  ],
  { stdio: "inherit" },
);
function copyGenerated(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) copyGenerated(absolute);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      const relative = path.relative(source, absolute).replace(/\.ts$/, ".js");
      fs.copyFileSync(path.join(output, relative), path.join(source, relative));
    }
  }
}
copyGenerated(source);
const workerVendor = path.join(source, "workers", "crypto", "vendor");
fs.mkdirSync(workerVendor, { recursive: true });
fs.copyFileSync(
  path.join(source, "vendor", "crypto-js.js"),
  path.join(workerVendor, "crypto-js.js"),
);
fs.copyFileSync(
  path.join(source, "vendor", "crypto-js.LICENSE"),
  path.join(workerVendor, "crypto-js.LICENSE"),
);
