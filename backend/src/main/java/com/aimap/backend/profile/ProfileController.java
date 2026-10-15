package com.aimap.backend.profile;

import com.aimap.backend.auth.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Avatars are stored on the phone since the local-storage release, so the former
 * POST /api/me/avatar upload endpoint has been removed. Old uploads stay readable by
 * their owner through LegacyAvatarController for the one-time migration.
 */
@RestController
@RequestMapping("/api/me")
public class ProfileController {
    private final UserProfileStore profiles;
    private final PublishedProfileService publishedProfiles;

    public ProfileController(UserProfileStore profiles, PublishedProfileService publishedProfiles) {
        this.profiles = profiles;
        this.publishedProfiles = publishedProfiles;
    }

    @GetMapping
    public UserProfile me() { return profiles.ensure(CurrentUser.openId()); }

    @PatchMapping("/published-profile")
    public void publish(@Valid @RequestBody PublishedProfileRequest request) {
        publishedProfiles.publish(CurrentUser.openId(), request);
    }

    @PatchMapping
    public UserProfile update(@Valid @RequestBody UserProfileRequest request) { return profiles.update(CurrentUser.openId(), request); }

    @PatchMapping("/visibility")
    public UserProfile updateVisibility(@Valid @RequestBody ProfileVisibilityRequest request) {
        return profiles.updateVisibility(CurrentUser.openId(), request.toVisibility());
    }
}
