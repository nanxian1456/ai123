package com.aimap.backend.profile;

public record ProfileVisibility(
        boolean avatar,
        boolean nickname,
        boolean organization,
        boolean position,
        boolean city,
        boolean bio
) {
    public static ProfileVisibility privateByDefault() {
        return new ProfileVisibility(false, false, false, false, false, false);
    }
}
