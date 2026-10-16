package com.aimap.backend.contact;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "contact_relationships")
public class RelationshipEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "owner_id", nullable = false, length = 128) private String ownerId;
    @Column(name = "source_id", nullable = false) private Long sourceId;
    @Column(name = "target_id", nullable = false) private Long targetId;
    @Column(nullable = false, length = 30) private String type;
    @Column(nullable = false, length = 200) private String note;

    protected RelationshipEntity() { }
    public RelationshipEntity(String ownerId, Long sourceId, Long targetId, String type, String note) {
        this.ownerId = ownerId;
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.type = type;
        this.note = note;
    }

    public Long getSourceId() { return sourceId; }
    public Long getTargetId() { return targetId; }
    public Relationship toRelationship() { return new Relationship(id, ownerId, sourceId, targetId, type, note); }
}
