package com.aimap.backend.profile;

import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;

/**
 * Compatibility entry point for earlier Java callers. HTTP routes are registered only by
 * AvatarController, which also enforces owner access and checks resolved filesystem paths.
 */
@Deprecated
public class LegacyAvatarController {
    private final AvatarController avatars;

    public LegacyAvatarController(UserProfileStore profiles, String avatarStorageDirectory) {
        this.avatars = new AvatarController(profiles, avatarStorageDirectory);
    }

    public ResponseEntity<Resource> avatar(String filename) {
        return avatars.download(filename);
    }
}
