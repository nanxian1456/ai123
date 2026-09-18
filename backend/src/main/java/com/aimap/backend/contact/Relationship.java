package com.aimap.backend.contact;

public record Relationship(Long id, String ownerId, Long sourceId, Long targetId, String type, String note) {}
