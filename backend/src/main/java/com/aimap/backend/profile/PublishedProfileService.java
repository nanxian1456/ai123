package com.aimap.backend.profile;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublishedProfileService {
    private final PublishedProfileRepository repository;
    private final UserProfileStore profiles;

    public PublishedProfileService(PublishedProfileRepository repository, UserProfileStore profiles) {
        this.repository = repository;
        this.profiles = profiles;
    }

    @Transactional
    public void publish(String ownerId, PublishedProfileRequest request) {
        profiles.ensure(ownerId);
        if (!request.published()) {
            repository.deleteById(ownerId);
            return;
        }
        String nickname = clean(request.nickname());
        if (nickname.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "公开昵称后才能使用导入码");
        PublishedProfileEntity entity = repository.findById(ownerId).orElseGet(() -> new PublishedProfileEntity(ownerId));
        entity.setNickname(nickname);
        entity.setOrganization(clean(request.organization()));
        entity.setPosition(clean(request.position()));
        entity.setCity(clean(request.city()));
        entity.setBio(clean(request.bio()));
        repository.save(entity);
    }

    public PublishedProfileEntity find(String ownerId) { return repository.findById(ownerId).orElse(null); }

    private String clean(String value) { return value == null ? "" : value.trim(); }
}
