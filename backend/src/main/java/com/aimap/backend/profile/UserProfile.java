package com.aimap.backend.profile;

public record UserProfile(
        String ownerId,
        String nickname,
        String organization,
        String position,
        String city,
        String bio,
        String avatarType,
        String avatarUrl,
        boolean profileCompleted
) { }
