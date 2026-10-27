package com.aimap.backend.auth;

import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

@Service
public class TokenService {
    private final AuthProperties properties;
    private final AccountSessions sessions;

    public TokenService(AuthProperties properties) {
        this(properties, new AccountSessions());
    }
    @org.springframework.beans.factory.annotation.Autowired
    public TokenService(AuthProperties properties, AccountSessions sessions) {
        if (properties.tokenSecret() == null || properties.tokenSecret().isBlank()) {
            throw new IllegalStateException("必须通过 AUTH_TOKEN_SECRET 配置令牌签名密钥");
        }
        this.properties = properties;
        this.sessions = sessions;
    }

    public String issue(String openId) {
        long expiresAt = Instant.now().plusSeconds(expiresInSeconds()).getEpochSecond();
        String payload = Base64.getUrlEncoder().withoutPadding().encodeToString((openId + "." + expiresAt + "." + sessions.generation(openId)).getBytes(StandardCharsets.UTF_8));
        return payload + "." + sign(payload);
    }

    public long expiresInSeconds() {
        return Math.multiplyExact(properties.tokenTtlHours(), 3600);
    }

    public String verify(String token) {
        if (token == null || token.isBlank()) return null;
        String[] parts = token.split("\\.");
        if (parts.length != 2 || !MessageDigest.isEqual(sign(parts[0]).getBytes(StandardCharsets.UTF_8), parts[1].getBytes(StandardCharsets.UTF_8))) return null;
        try {
            String[] payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8).split("\\.");
            if ((payload.length != 2 && payload.length != 3) || Long.parseLong(payload[1]) <= Instant.now().getEpochSecond() || payload[0].isBlank()) return null;
            if (!sessions.matches(payload[0], payload.length == 3 ? payload[2] : null)) return null;
            return payload[0];
        } catch (IllegalArgumentException ignored) { return null; }
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(properties.tokenSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) { throw new IllegalStateException("令牌服务不可用", exception); }
    }
}
