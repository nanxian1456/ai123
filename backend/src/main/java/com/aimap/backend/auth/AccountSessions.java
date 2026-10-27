package com.aimap.backend.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AccountSessions {
    private final AccountSessionRepository repository;
    private final AccountDeletionReceiptRepository receipts;
    private final ConcurrentHashMap<String, String> memory = new ConcurrentHashMap<>();
    @Autowired public AccountSessions(AccountSessionRepository repository, AccountDeletionReceiptRepository receipts) { this.repository = repository; this.receipts = receipts; }
    public AccountSessions() { this.repository = null; this.receipts = null; }
    public String generation(String owner) {
        String key = hash(owner);
        if (repository == null) return memory.getOrDefault(key, "initial");
        return repository.findById(key).map(AccountSessionEntity::getGeneration).orElse("initial");
    }
    public boolean matches(String owner, String generation) {
        String key = hash(owner);
        String current = repository == null ? memory.get(key) : repository.findById(key).map(AccountSessionEntity::getGeneration).orElse(null);
        return current == null ? generation == null || generation.equals("initial") : current.equals(generation);
    }
    @Transactional public void revokeAll(String owner) {
        String key = hash(owner), next = UUID.randomUUID().toString();
        if (repository == null) memory.put(key, next);
        else {
            AccountSessionEntity state = repository.findById(key).orElseGet(() -> new AccountSessionEntity(key, next));
            state.setGeneration(next); repository.saveAndFlush(state);
        }
    }
    public boolean deletionConfirmed(String owner, String operationId) {
        if (operationId == null) return false;
        String receipt = hash(owner + "\n" + operationId);
        if (receipts == null) return memory.containsKey("deleted:" + receipt);
        return receipts.existsById(receipt);
    }
    @Transactional public void markDeleted(String owner, String operationId) {
        revokeAll(owner);
        String receipt = hash(owner + "\n" + operationId);
        if (receipts == null) memory.put("deleted:" + receipt, "confirmed");
        else receipts.saveAndFlush(new AccountDeletionReceiptEntity(receipt));
    }
    private String hash(String owner) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(owner.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
