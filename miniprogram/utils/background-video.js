"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIDEO_TIMEOUT_MS = void 0;
exports.startBackgroundVideo = startBackgroundVideo;
exports.backgroundVideoPlaying = backgroundVideoPlaying;
exports.backgroundVideoFailed = backgroundVideoFailed;
exports.stopBackgroundVideo = stopBackgroundVideo;
const api_config_1 = require("./api-config");
/**
 * Background video for the entry and login pages.
 *
 * The page's CSS gradient is always visible. The <video> stays transparent until it really
 * starts playing (bindplay), because a video that cannot load (backend not running, file
 * missing, slow network) renders an opaque black box and does not always fire binderror.
 * If a candidate has not started within VIDEO_TIMEOUT_MS it is dropped and the next one is
 * tried; when none plays the video element is removed and only the gradient remains.
 */
exports.VIDEO_TIMEOUT_MS = 5000;
function clearTimer(page) {
    if (page.bgVideoTimer != null)
        clearTimeout(page.bgVideoTimer);
    page.bgVideoTimer = null;
}
function tryCandidate(page, index) {
    clearTimer(page);
    const candidates = page.bgVideoCandidates || [];
    page.bgVideoIndex = index;
    const url = index < candidates.length ? (0, api_config_1.getMediaUrl)(candidates[index]) : "";
    page.setData({ bgVideo: url, videoReady: false });
    if (!url)
        return;
    page.bgVideoTimer = setTimeout(() => tryCandidate(page, index + 1), exports.VIDEO_TIMEOUT_MS);
}
function startBackgroundVideo(page, candidates) {
    page.bgVideoCandidates = candidates;
    tryCandidate(page, 0);
}
function backgroundVideoPlaying(page) {
    clearTimer(page);
    page.setData({ videoReady: true });
}
function backgroundVideoFailed(page) {
    tryCandidate(page, (page.bgVideoIndex || 0) + 1);
}
function stopBackgroundVideo(page) {
    clearTimer(page);
}
