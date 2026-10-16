package com.aimap.backend.contact;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(name = "relationships", indexes = {
        @Index(name = "idx_relationships_owner", columnList = "owner_id"),
        @Index(name = "idx_relationships_source", columnList = "owner_id,source_id"),
        @Index(name = "idx_relationships_target", columnList = "owner_id,target_id")
})
public class RelationshipEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "owner_id", nullable = false, length = 128) private String ownerId;
    @Column(name = "source_id", nullable = false) private Long sourceId;
    @Column(name = "target_id", nullable = false) private Long targetId;
    @Column(nullable = false, length = 30) private String type;
    @Column(nullable = false, length = 200) private String note = "";

    protected RelationshipEntity() { }

    public RelationshipEntity(String ownerId, Long sourceId, Long targetId, String type, String note) {
        this.ownerId = ownerId;
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.type = type;
        this.note = note;
    }

    public Long getId() { return id; }
    public String getOwnerId() { return ownerId; }
    public Long getSourceId() { return sourceId; }
    public Long getTargetId() { return targetId; }
    public String getType() { return type; }
    public String getNote() { return note; }
}
