package com.aimap.backend.contact;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RelationshipRepository extends JpaRepository<RelationshipEntity, Long> {
    List<RelationshipEntity> findByOwnerIdOrderByIdAsc(String ownerId);
    Optional<RelationshipEntity> findByOwnerIdAndId(String ownerId, Long id);

    @Modifying
    @Query("delete from RelationshipEntity r where r.ownerId = :ownerId and (r.sourceId = :contactId or r.targetId = :contactId)")
    void deleteForContact(@Param("ownerId") String ownerId, @Param("contactId") Long contactId);
}
