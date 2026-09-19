package com.aimap.backend.profile;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserProfileRepository extends JpaRepository<UserProfileEntity, String> {
    Optional<UserProfileEntity> findByContactCode(String contactCode);
    boolean existsByContactCode(String contactCode);
}
