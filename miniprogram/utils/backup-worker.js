let queue = Promise.resolve();
let sequence = 0;
const TIMEOUT_MS = 60000;

function compute(password, salt) {
  return new Promise((resolve, reject) => {
    if (typeof wx.createWorker !== "function") return reject(new Error("请更新微信后使用后台加密备份，当前版本不支持后台计算"));
    let thread;
    let timer;
    let settled = false;
    const id = ++sequence;
    function finish(error, hex) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (thread) { try { thread.terminate(); } catch (_) { /* Platform may already have terminated it. */ } }
      thread = null;
      password = "";
      if (error) reject(error); else resolve(hex);
    }
    try {
      thread = wx.createWorker("workers/crypto/index.js");
      thread.onMessage(message => {
        if (!message || message.id !== id) return;
        if (typeof message.hex !== "string" || !/^[0-9a-f]{128}$/.test(message.hex)) return finish(new Error("备份密钥计算失败，请重试"));
        finish(null, message.hex);
      });
      if (typeof thread.onError === "function") thread.onError(() => finish(new Error("后台加密计算失败，请重试")));
      if (typeof thread.onProcessKilled === "function") thread.onProcessKilled(() => finish(new Error("后台加密计算被系统中止，请重试")));
      timer = setTimeout(() => finish(new Error("后台加密计算超时，请重试")), TIMEOUT_MS);
      thread.postMessage({ id, password, salt, rounds: 100000 });
      password = "";
    } catch (_) { finish(new Error("后台加密无法启动，请更新微信后重试")); }
  });
}
function derive(password, salt) {
  if (typeof password !== "string" || password.length < 10 || !/^[0-9a-f]{32}$/.test(salt)) return Promise.reject(new Error("备份密码或密钥参数无效"));
  const operation = queue.catch(() => {}).then(() => compute(password, salt));
  queue = operation.then(() => {}, () => {});
  return operation;
}
module.exports = { derive };
