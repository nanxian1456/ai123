"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGAL_VERSION = void 0;
exports.hasConsent = hasConsent;
exports.recordConsent = recordConsent;
exports.hasAiConsent = hasAiConsent;
exports.recordAiConsent = recordAiConsent;
exports.withdrawAiConsent = withdrawAiConsent;
exports.withdrawConsent = withdrawConsent;
exports.confirmAiTransfer = confirmAiTransfer;
exports.forgetAccountConsent = forgetAccountConsent;
/**
 * User consent records, kept per WeChat account in local storage.
 *
 * - General consent: the user agreed to the current 《用户协议》 and 《隐私政策》. Bumping
 *   LEGAL_VERSION after a material policy change asks everyone to agree again.
 * - AI consent: separate consent (PIPL "单独同意") before pasted text, which usually describes
 *   other people, is sent to DeepSeek. It can be withdrawn on its own in 隐私与授权 settings.
 */
exports.LEGAL_VERSION = "2026-10-25";
const CONSENT_KEY = "ai-network-consent";
const AI_CONSENT_KEY = "ai-network-ai-consent";
function ownerId() { return wx.getStorageSync("ai-network-owner-id") || ""; }
function scoped(key) { const owner = ownerId(); return `${key}:${owner ? encodeURIComponent(owner) : "prelogin"}`; }
function readVersion(key) {
    try {
        const value = wx.getStorageSync(key);
        return value && typeof value.version === "string" ? value.version : "";
    }
    catch {
        return "";
    }
}
function remove(key) {
    try {
        wx.removeStorageSync(key);
        if (wx.getStorageSync(key))
            throw new Error("record remains");
    }
    catch (_) {
        throw new Error("授权记录未能清除，请稍后重试；当前授权状态尚未更改");
    }
}
function hasConsent() {
    return readVersion(scoped(CONSENT_KEY)) === exports.LEGAL_VERSION;
}
function recordConsent() {
    wx.setStorageSync(scoped(CONSENT_KEY), { version: exports.LEGAL_VERSION, acceptedAt: Date.now() });
}
function hasAiConsent() {
    if (!ownerId())
        return false;
    return readVersion(scoped(AI_CONSENT_KEY)) === exports.LEGAL_VERSION;
}
function recordAiConsent() {
    if (!ownerId())
        throw new Error("请先登录再授权 AI 整理");
    wx.setStorageSync(scoped(AI_CONSENT_KEY), { version: exports.LEGAL_VERSION, acceptedAt: Date.now() });
}
function withdrawAiConsent() {
    remove(scoped(AI_CONSENT_KEY));
    remove(AI_CONSENT_KEY);
}
/** Withdraws every consent; the caller signs the user out afterwards. Local records are kept. */
function withdrawConsent() {
    remove(scoped(AI_CONSENT_KEY));
    remove(AI_CONSENT_KEY);
    remove(scoped(CONSENT_KEY));
    remove(CONSENT_KEY);
    remove(`${CONSENT_KEY}:prelogin`);
}
/** Resolves true only after the user has agreed (now or earlier) to send text to DeepSeek. */
function confirmAiTransfer() {
    const owner = ownerId();
    if (!owner)
        return Promise.resolve(false);
    if (hasAiConsent())
        return Promise.resolve(true);
    return new Promise((resolve) => wx.showModal({
        title: "发送文字给 DeepSeek",
        content: "智能整理会把你粘贴的文字经我们的服务器发送给深度求索（DeepSeek）的接口，用于识别姓名、单位、电话等字段。文字中通常包含他人的个人信息，请确认你有权提供。服务器不保存原文。同意后可随时在「设置 › 隐私与授权」中撤回。",
        confirmText: "同意整理",
        cancelText: "暂不",
        success: (result) => {
            if (!result.confirm || owner !== ownerId())
                return resolve(false);
            try {
                recordAiConsent();
            }
            catch {
                /* Proceed for this request; the user will be asked again next time. */
            }
            resolve(true);
        },
        fail: () => resolve(false),
    }));
}
/** Called with the deleted account identity before its local session is cleared. */
function forgetAccountConsent(owner) {
    wx.removeStorageSync(`${CONSENT_KEY}:${encodeURIComponent(owner)}`);
    wx.removeStorageSync(`${AI_CONSENT_KEY}:${encodeURIComponent(owner)}`);
}
