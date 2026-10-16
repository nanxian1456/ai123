import { validateSession, clearSession, hasProfileData, showError } from "../../utils/api";
import { getMediaUrl } from "../../utils/api-config";
import { hasConsent } from "../../utils/consent";

// Put the entry animation at backend/src/main/resources/static/videos/entry.mp4.
// Until it exists the shared login background is used, then a plain gradient.
const VIDEO_CANDIDATES = ["/videos/entry.mp4", "/videos/background.mp4"];

Page({
  data: { checking: false, bgVideo: "" },
  videoIndex: 0,
  onLoad() {
    this.videoIndex = 0;
    this.setData({ bgVideo: getMediaUrl(VIDEO_CANDIDATES[0]) });
  },
  onVideoError() {
    this.videoIndex += 1;
    const next = VIDEO_CANDIDATES[this.videoIndex];
    this.setData({ bgVideo: next ? getMediaUrl(next) : "" });
  },
  enterHome() {
    if (this.data.checking) return;
    // Existing users who have not agreed to the current terms confirm them on the login page.
    // After agreement, the login page reuses local identity without requiring a network login.
    if (!hasConsent()) {
      wx.reLaunch({ url: "/pages/auth/index" });
      return;
    }
    this.setData({ checking: true });
    return validateSession<any>()
      .then((profile: any) => {
        if (hasProfileData(profile)) {
          wx.reLaunch({ url: "/pages/index/index" });
          return;
        }
        clearSession();
        wx.reLaunch({ url: "/pages/auth/index" });
      })
      .catch((error: Error) => {
        if (error.message !== "NO_SESSION" && error.message !== "SESSION_INVALID") {
          showError(error);
          return;
        }
        clearSession();
        wx.reLaunch({ url: "/pages/auth/index" });
      })
      .finally(() => this.setData({ checking: false }));
  }
});
