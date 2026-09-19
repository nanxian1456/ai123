package com.aimap.backend.profile;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class UserProfileStore {
    private final Map<String, UserProfile> profiles = new ConcurrentHashMap<>();

    public UserProfile ensure(String ownerId) {
        return profiles.computeIfAbsent(ownerId, id -> new UserProfile(id, "", "", "", "", "", false));
    }

    public UserProfile update(String ownerId, UserProfileRequest request) {
        UserProfile profile = new UserProfile(ownerId, request.nickname().trim(), value(request.organization()), value(request.position()), value(request.city()), value(request.bio()), true);
        profiles.put(ownerId, profile);
        return profile;
    }

    private String value(String value) { return value == null ? "" : value.trim(); }
}
