package com.aimap.backend.auth;
import org.springframework.data.jpa.repository.JpaRepository;
public interface AccountSessionRepository extends JpaRepository<AccountSessionEntity, String> { }
