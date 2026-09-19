package com.aimap.backend.profile;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class UserProfileStore {
    private final Map<String, UserProfile> profiles = new ConcurrentHashMap<>();

    public UserProfile ensure(String ownerId) {
        return profiles.computeIfAbsent(ownerId, id -> new UserProfile(id, "", "", "", "", "", "male-1", "", false));
    }

    public UserProfile update(String ownerId, UserProfileRequest request) {
        UserProfile existing = ensure(ownerId);
        String avatarType = request.avatarType() == null || request.avatarType().isBlank() ? existing.avatarType() : request.avatarType();
        UserProfile profile = new UserProfile(ownerId, request.nickname().trim(), value(request.organization()), value(request.position()), value(request.city()), value(request.bio()), avatarType, existing.avatarUrl(), true);
        profiles.put(ownerId, profile);
        return profile;
    }

    public UserProfile updateAvatar(String ownerId, String avatarUrl) {
        UserProfile existing = ensure(ownerId);
        UserProfile profile = new UserProfile(existing.ownerId(), existing.nickname(), existing.organization(), existing.position(), existing.city(), existing.bio(), existing.avatarType(), avatarUrl, existing.profileCompleted());
        profiles.put(ownerId, profile);
        return profile;
    }

    private String value(String value) { return value == null ? "" : value.trim(); }
}
