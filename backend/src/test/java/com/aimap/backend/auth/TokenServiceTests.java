package com.aimap.backend.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class TokenServiceTests {
    private final TokenService tokens = new TokenService(new AuthProperties("test-token-secret", 1));

    @Test
    void acceptsItsOwnTokenAndRejectsTampering() {
        String token = tokens.issue("wx-user-one");
        assertEquals("wx-user-one", tokens.verify(token));
        assertNull(tokens.verify(token + "changed"));
        assertEquals(3600, tokens.expiresInSeconds());
    }
}
