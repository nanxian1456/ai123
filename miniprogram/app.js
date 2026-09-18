const { ensureSession } = require("./utils/api");
App({ onLaunch() { ensureSession().catch(() => {}); } });
