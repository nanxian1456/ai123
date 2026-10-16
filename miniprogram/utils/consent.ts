/**
 * User consent records, kept per WeChat account in local storage.
 *
 * - General consent: the user agreed to the current 《用户协议》 and 《隐私政策》. Bumping
 *   LEGAL_VERSION after a material policy change asks everyone to agree again.
 * - AI consent: separate consent (PIPL "单独同意") before pasted text, which usually describes
 *   other people, is sent to DeepSeek. It can be withdrawn on its own in 个人隐私 settings.
 */
export const LEGAL_VERSION = "2026-10-15";
const CONSENT_KEY = "ai-network-consent";
const AI_CONSENT_KEY = "ai-network-ai-consent";

function readVersion(key: string): string {
  try {
    const value = wx.getStorageSync(key);
    return value && typeof value.version === "string" ? value.version : "";
  } catch {
    return "";
  }
}
function remove(key: string): void {
  try {
    wx.removeStorageSync(key);
  } catch {
    /* Nothing stored. */
  }
}

export function hasConsent(): boolean {
  return readVersion(CONSENT_KEY) === LEGAL_VERSION;
}
export function recordConsent(): void {
  wx.setStorageSync(CONSENT_KEY, { version: LEGAL_VERSION, acceptedAt: Date.now() });
}
export function hasAiConsent(): boolean {
  return readVersion(AI_CONSENT_KEY) === LEGAL_VERSION;
}
export function recordAiConsent(): void {
  wx.setStorageSync(AI_CONSENT_KEY, { version: LEGAL_VERSION, acceptedAt: Date.now() });
}
export function withdrawAiConsent(): void {
  remove(AI_CONSENT_KEY);
}
/** Withdraws every consent; the caller signs the user out afterwards. Local records are kept. */
export function withdrawConsent(): void {
  remove(AI_CONSENT_KEY);
  remove(CONSENT_KEY);
}

/** Resolves true only after the user has agreed (now or earlier) to send text to DeepSeek. */
export function confirmAiTransfer(): Promise<boolean> {
  if (hasAiConsent()) return Promise.resolve(true);
  return new Promise<boolean>((resolve) =>
    wx.showModal({
      title: "发送文字给 DeepSeek",
      content:
        "智能整理会把你粘贴的文字经我们的服务器发送给深度求索（DeepSeek）的接口，用于识别姓名、单位、电话等字段。文字中通常包含他人的个人信息，请确认你有权提供。服务器不保存原文。同意后可随时在「设置 › 个人隐私」中撤回。",
      confirmText: "同意整理",
      cancelText: "暂不",
      success: (result) => {
        if (!result.confirm) return resolve(false);
        try {
          recordAiConsent();
        } catch {
          /* Proceed for this request; the user will be asked again next time. */
        }
        resolve(true);
      },
      fail: () => resolve(false),
    }),
  );
}
