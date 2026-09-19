package com.aimap.backend.profile;

import org.springframework.stereotype.Component;

import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class UserProfileStore {
    private final UserProfileRepository repository;
    private final Map<String, UserProfile> testProfiles;

    public UserProfileStore(UserProfileRepository repository) { this.repository = repository; this.testProfiles = new ConcurrentHashMap<>(); }
    public UserProfileStore() { this.repository = null; this.testProfiles = new ConcurrentHashMap<>(); }

    @Transactional
    public UserProfile ensure(String ownerId) {
        if (repository == null) return testProfiles.computeIfAbsent(ownerId, id -> new UserProfile(id, "", "", "", "", "", "male-1", "", ProfileVisibility.privateByDefault(), false));
        return toProfile(repository.findById(ownerId).orElseGet(() -> repository.save(new UserProfileEntity(ownerId))));
    }

    @Transactional
    public UserProfile update(String ownerId, UserProfileRequest request) {
        if (repository == null) {
            UserProfile existing = ensure(ownerId);
            String avatarType = request.avatarType() == null || request.avatarType().isBlank() ? existing.avatarType() : request.avatarType();
            UserProfile profile = new UserProfile(ownerId, request.nickname().trim(), value(request.organization()), value(request.position()), value(request.city()), value(request.bio()), avatarType, existing.avatarUrl(), existing.visibility(), true);
            testProfiles.put(ownerId, profile);
            return profile;
        }
        UserProfileEntity entity = getOrCreate(ownerId);
        entity.setNickname(request.nickname().trim()); entity.setOrganization(value(request.organization()));
        entity.setPosition(value(request.position())); entity.setCity(value(request.city())); entity.setBio(value(request.bio()));
        if (request.avatarType() != null && !request.avatarType().isBlank()) entity.setAvatarType(request.avatarType());
        entity.setProfileCompleted(true);
        return toProfile(repository.save(entity));
    }

    @Transactional
    public UserProfile updateAvatar(String ownerId, String avatarUrl) {
        if (repository == null) {
            UserProfile existing = ensure(ownerId);
            UserProfile profile = new UserProfile(existing.ownerId(), existing.nickname(), existing.organization(), existing.position(), existing.city(), existing.bio(), existing.avatarType(), avatarUrl, existing.visibility(), existing.profileCompleted());
            testProfiles.put(ownerId, profile);
            return profile;
        }
        UserProfileEntity entity = getOrCreate(ownerId); entity.setAvatarUrl(avatarUrl); return toProfile(repository.save(entity));
    }

    @Transactional
    public UserProfile updateVisibility(String ownerId, ProfileVisibility visibility) {
        if (repository == null) {
            UserProfile existing = ensure(ownerId);
            UserProfile profile = new UserProfile(existing.ownerId(), existing.nickname(), existing.organization(), existing.position(), existing.city(), existing.bio(), existing.avatarType(), existing.avatarUrl(), visibility, existing.profileCompleted());
            testProfiles.put(ownerId, profile);
            return profile;
        }
        UserProfileEntity entity = getOrCreate(ownerId);
        entity.setAvatarVisible(visibility.avatar()); entity.setNicknameVisible(visibility.nickname()); entity.setOrganizationVisible(visibility.organization());
        entity.setPositionVisible(visibility.position()); entity.setCityVisible(visibility.city()); entity.setBioVisible(visibility.bio());
        return toProfile(repository.save(entity));
    }

    private UserProfileEntity getOrCreate(String ownerId) { return repository.findById(ownerId).orElseGet(() -> repository.save(new UserProfileEntity(ownerId))); }
    private UserProfile toProfile(UserProfileEntity entity) {
        ProfileVisibility visibility = new ProfileVisibility(entity.isAvatarVisible(), entity.isNicknameVisible(), entity.isOrganizationVisible(), entity.isPositionVisible(), entity.isCityVisible(), entity.isBioVisible());
        return new UserProfile(entity.getOwnerId(), entity.getNickname(), entity.getOrganization(), entity.getPosition(), entity.getCity(), entity.getBio(), entity.getAvatarType(), entity.getAvatarUrl(), visibility, entity.isProfileCompleted());
    }
    private String value(String value) { return value == null ? "" : value.trim(); }
}
