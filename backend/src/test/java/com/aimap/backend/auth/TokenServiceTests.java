package com.aimap.backend.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

class TokenServiceTests {
    private final TokenService tokens = new TokenService(new AuthProperties("test-token-secret", 1));

    @Test
    void acceptsItsOwnTokenAndRejectsTampering() {
        String token = tokens.issue("wx-user-one");
        assertEquals("wx-user-one", tokens.verify(token));
        assertNull(tokens.verify(token + "changed"));
        assertEquals(3600, tokens.expiresInSeconds());
    }
    @Test void existingTokensStayValidUntilExplicitAccountRevocation() throws Exception {
        var state = new AccountSessions();
        var service = new TokenService(new AuthProperties("fixture-secret", 1), state);
        String payload = Base64.getUrlEncoder().withoutPadding().encodeToString(("legacy-owner." + (java.time.Instant.now().getEpochSecond() + 3600)).getBytes(StandardCharsets.UTF_8));
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec("fixture-secret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String old = payload + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        assertEquals("legacy-owner", service.verify(old));
        String newer = service.issue("legacy-owner");
        assertEquals("legacy-owner", service.verify(old), "ordinary login must not revoke another valid session");
        state.revokeAll("legacy-owner");
        assertNull(service.verify(old)); assertNull(service.verify(newer));
        assertEquals("legacy-owner", service.verify(service.issue("legacy-owner")));
    }
}
