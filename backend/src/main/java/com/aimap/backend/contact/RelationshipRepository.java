package com.aimap.backend.contact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RelationshipRepository extends JpaRepository<RelationshipEntity, Long> {
    List<RelationshipEntity> findByOwnerId(String ownerId);
    Optional<RelationshipEntity> findByIdAndOwnerId(Long id, String ownerId);
}
