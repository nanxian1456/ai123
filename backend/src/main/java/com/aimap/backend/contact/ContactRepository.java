package com.aimap.backend.contact;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ContactRepository extends JpaRepository<ContactEntity, Long> {
    List<ContactEntity> findByOwnerIdOrderByIdAsc(String ownerId);
    Optional<ContactEntity> findByIdAndOwnerId(Long id, String ownerId);
    boolean existsByOwnerId(String ownerId);
}
