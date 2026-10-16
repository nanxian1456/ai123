const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function client(createWorker, timer = setTimeout) {
  const scope = { wx: { createWorker }, module: { exports: {} }, setTimeout: timer, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/utils/backup-worker.js"), "utf8"), scope);
  return scope.module.exports;
}
test("worker derivations serialize and terminate before another begins", async () => {
  const pending = [];
  let active = 0;
  const api = client(script => {
    assert.equal(script, "workers/crypto/index.js"); assert.equal(active++, 0);
    let listener;
    return { onMessage: callback => { listener = callback; }, postMessage: data => pending.push(() => listener({ id: data.id, hex: "ab".repeat(64) })), terminate: () => { active--; } };
  });
  const first = api.derive("strong-password", "00".repeat(16));
  const second = api.derive("another-password", "01".repeat(16));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 1); pending.shift()(); await first;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 1); pending.shift()(); await second;
  assert.equal(active, 0);
});
test("worker timeout terminates computation without exposing password", async () => {
  let timeout;
  let stopped = false;
  const api = client(() => ({ onMessage: () => {}, postMessage: () => {}, terminate: () => { stopped = true; } }), callback => { timeout = callback; return 0; });
  const pending = api.derive("secret-password", "00".repeat(16));
  await new Promise(resolve => setImmediate(resolve)); timeout();
  await assert.rejects(pending, error => /超时/.test(error.message) && !error.message.includes("secret-password"));
  assert.equal(stopped, true);
});
test("worker rejects malformed key output and releases the worker", async () => {
  let stopped = false;
  let receive;
  const api = client(() => ({ onMessage: callback => { receive = callback; }, postMessage: data => receive({ id: data.id, hex: "bad" }), terminate: () => { stopped = true; } }));
  await assert.rejects(api.derive("strong-password", "00".repeat(16)), /计算失败/);
  assert.equal(stopped, true);
});

test("worker process loss releases the queue for a later retry", async () => {
  let killed;
  let stopped = 0;
  let count = 0;
  const api = client(() => {
    const attempt = ++count;
    let receive;
    return { onMessage: callback => { receive = callback; }, onProcessKilled: callback => { killed = callback; },
      postMessage: data => { if (attempt > 1) receive({ id: data.id, hex: "ab".repeat(64) }); }, terminate: () => { stopped++; } };
  });
  const first = api.derive("strong-password", "00".repeat(16));
  await new Promise(resolve => setImmediate(resolve)); killed();
  await assert.rejects(first, /系统中止/);
  assert.equal(await api.derive("strong-password", "00".repeat(16)), "ab".repeat(64));
  assert.equal(stopped, 2);
});
