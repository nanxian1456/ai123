package com.aimap.backend.profile;

import com.aimap.backend.auth.AccountSessions;
import com.aimap.backend.contact.ContactRepository;
import com.aimap.backend.contact.RelationshipRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.cache.annotation.CacheEvict;

@Service
public class AccountDeletionService {
    private final UserProfileRepository profiles;
    private final PublishedProfileRepository published;
    private final ContactRepository contacts;
    private final RelationshipRepository relationships;
    private final AccountSessions sessions;
    private final AccountAvatarCleanup avatars;
    public AccountDeletionService(UserProfileRepository profiles, PublishedProfileRepository published,
            ContactRepository contacts, RelationshipRepository relationships, AccountSessions sessions, AccountAvatarCleanup avatars) {
        this.profiles = profiles; this.published = published; this.contacts = contacts;
        this.relationships = relationships; this.sessions = sessions;
        this.avatars = avatars;
    }
    @Transactional
    @CacheEvict(cacheNames = {"profiles", "contactInsights"}, allEntries = true)
    public void delete(String owner, String operationId) {
        if (sessions.deletionConfirmed(owner, operationId)) return;
        String avatar = profiles.findById(owner).map(UserProfileEntity::getAvatarUrl).orElse("");
        sessions.markDeleted(owner, operationId);
        relationships.deleteByOwnerId(owner); relationships.flush();
        contacts.deleteByOwnerId(owner); contacts.flush();
        published.deleteById(owner);
        profiles.deleteById(owner);
        avatars.afterCommit(avatar);
    }
}
