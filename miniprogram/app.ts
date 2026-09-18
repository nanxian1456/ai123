import { ensureSession } from "./utils/api";
App({ onLaunch() { ensureSession().catch(() => undefined); } });
