package com.aimap.backend.auth;

import jakarta.persistence.*;

@Entity
@Table(name = "account_deletion_receipts")
public class AccountDeletionReceiptEntity {
    @Id @Column(name = "receipt_hash", length = 64) private String receiptHash;
    protected AccountDeletionReceiptEntity() { }
    public AccountDeletionReceiptEntity(String receiptHash) { this.receiptHash = receiptHash; }
}
