package com.aimap.backend.profile;

import jakarta.validation.constraints.NotNull;

public record ProfileVisibilityRequest(
        @NotNull Boolean avatar,
        @NotNull Boolean nickname,
        @NotNull Boolean organization,
        @NotNull Boolean position,
        @NotNull Boolean city,
        @NotNull Boolean bio
) {
    public ProfileVisibility toVisibility() {
        return new ProfileVisibility(avatar, nickname, organization, position, city, bio);
    }
}
