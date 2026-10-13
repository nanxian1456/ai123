const CryptoJS = require("./vendor/crypto-js");

worker.onMessage(message => {
  const id = message && message.id;
  try {
    if (!message || !Number.isSafeInteger(id) || typeof message.password !== "string" || message.password.length < 10 ||
        typeof message.salt !== "string" || !/^[0-9a-f]{32}$/.test(message.salt) || message.rounds !== 100000) throw new Error("invalid");
    const hex = CryptoJS.PBKDF2(message.password, CryptoJS.enc.Hex.parse(message.salt), {
      keySize: 16, iterations: 100000, hasher: CryptoJS.algo.SHA256
    }).toString(CryptoJS.enc.Hex);
    message.password = "";
    worker.postMessage({ id, hex });
  } catch (_) {
    if (message) message.password = "";
    worker.postMessage({ id, error: "KEY_DERIVATION_FAILED" });
  }
});
