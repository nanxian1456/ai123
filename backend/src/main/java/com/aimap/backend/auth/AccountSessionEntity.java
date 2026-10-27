package com.aimap.backend.auth;

import jakarta.persistence.*;

@Entity
@Table(name = "account_sessions")
public class AccountSessionEntity {
    @Id @Column(name = "owner_hash", length = 64) private String ownerHash;
    @Column(nullable = false, length = 36) private String generation;
    protected AccountSessionEntity() { }
    public AccountSessionEntity(String ownerHash, String generation) { this.ownerHash = ownerHash; this.generation = generation; }
    public String getGeneration() { return generation; }
    public void setGeneration(String value) { generation = value; }
}
