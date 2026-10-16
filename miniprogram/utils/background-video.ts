import { getMediaUrl } from "./api-config";

/**
 * Background video for the entry and login pages.
 *
 * The page's CSS gradient is always visible. The <video> stays transparent until it really
 * starts playing (bindplay), because a video that cannot load (backend not running, file
 * missing, slow network) renders an opaque black box and does not always fire binderror.
 * If a candidate has not started within VIDEO_TIMEOUT_MS it is dropped and the next one is
 * tried; when none plays the video element is removed and only the gradient remains.
 */
export const VIDEO_TIMEOUT_MS = 5000;

interface BackgroundVideoPage {
  setData(values: Record<string, unknown>): void;
  bgVideoCandidates?: string[];
  bgVideoIndex?: number;
  bgVideoTimer?: number | null;
}

function clearTimer(page: BackgroundVideoPage): void {
  if (page.bgVideoTimer != null) clearTimeout(page.bgVideoTimer);
  page.bgVideoTimer = null;
}

function tryCandidate(page: BackgroundVideoPage, index: number): void {
  clearTimer(page);
  const candidates = page.bgVideoCandidates || [];
  page.bgVideoIndex = index;
  const url = index < candidates.length ? getMediaUrl(candidates[index]) : "";
  page.setData({ bgVideo: url, videoReady: false });
  if (!url) return;
  page.bgVideoTimer = setTimeout(() => tryCandidate(page, index + 1), VIDEO_TIMEOUT_MS) as unknown as number;
}

export function startBackgroundVideo(page: BackgroundVideoPage, candidates: string[]): void {
  page.bgVideoCandidates = candidates;
  tryCandidate(page, 0);
}
export function backgroundVideoPlaying(page: BackgroundVideoPage): void {
  clearTimer(page);
  page.setData({ videoReady: true });
}
export function backgroundVideoFailed(page: BackgroundVideoPage): void {
  tryCandidate(page, (page.bgVideoIndex || 0) + 1);
}
export function stopBackgroundVideo(page: BackgroundVideoPage): void {
  clearTimer(page);
}
