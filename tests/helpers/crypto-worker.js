const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function createWorker(scriptPath) {
  let receive;
  let mainReceive;
  let stopped = false;
  const scope = { worker: { onMessage: listener => { receive = listener; }, postMessage: message => { if (!stopped) mainReceive(message); } },
    require: id => {
      if (id !== "./vendor/crypto-js") throw new Error("unexpected worker dependency");
      return require("../../miniprogram/vendor/crypto-js");
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../miniprogram", scriptPath), "utf8"), scope);
  return { onMessage: listener => { mainReceive = listener; }, onError: () => {}, onProcessKilled: () => {},
    postMessage: message => setImmediate(() => { if (!stopped) receive(structuredClone(message)); }), terminate: () => { stopped = true; } };
};
