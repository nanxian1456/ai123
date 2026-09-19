package com.aimap.backend.profile;

public record ProfileVisibilityRequest(
        boolean avatar,
        boolean nickname,
        boolean organization,
        boolean position,
        boolean city,
        boolean bio
) {
    public ProfileVisibility toVisibility() {
        return new ProfileVisibility(avatar, nickname, organization, position, city, bio);
    }
}
