package com.aimap.backend.config;

import com.aimap.backend.auth.TokenService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.slf4j.MDC;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class ApiSecurityFilter extends OncePerRequestFilter {
    private static final long WINDOW_SECONDS = 60;
    private static final int MAX_TRACKED_CLIENTS = 10_000;
    private final Map<String, RequestWindow> windows = new ConcurrentHashMap<>();
    private final AtomicLong requests = new AtomicLong();
    /** Verifies bearer tokens so that only genuine sessions get their own bucket; null only in unit tests. */
    private final TokenService tokenService;
    private final int defaultLimit;
    private final int writeLimit;
    private final int aiLimit;
    private final int importLimit;

    @Autowired
    public ApiSecurityFilter(
            TokenService tokenService,
            @Value("${api.rate-limit.default-per-minute:120}") int defaultLimit,
            @Value("${api.rate-limit.write-per-minute:60}") int writeLimit,
            @Value("${api.rate-limit.ai-per-minute:10}") int aiLimit,
            @Value("${api.rate-limit.import-per-minute:30}") int importLimit
    ) {
        this.tokenService = tokenService;
        this.defaultLimit = defaultLimit;
        this.writeLimit = writeLimit;
        this.aiLimit = aiLimit;
        this.importLimit = importLimit;
    }

    ApiSecurityFilter(int defaultLimit, int writeLimit, int aiLimit, int importLimit) {
        this(null, defaultLimit, writeLimit, aiLimit, importLimit);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "no-referrer");

        int limit = limitFor(request);
        if (limit > 0 && !allow(request.getRequestURI() + ":" + clientKey(request), limit)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", String.valueOf(WINDOW_SECONDS));
            response.setContentType("application/json;charset=UTF-8");
            String requestId = MDC.get("requestId");
            response.getWriter().write("{\"status\":429,\"code\":\"RATE_LIMITED\",\"message\":\"请求过于频繁，请稍后再试\",\"requestId\":\"" + (requestId == null ? "" : requestId) + "\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    private int limitFor(HttpServletRequest request) {
        String path = request.getRequestURI();
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return 0;
        if ("/api/auth/wechat-login".equals(path)) return 10;
        if ("/api/ai/extract".equals(path)) return aiLimit;
        if (path.startsWith("/api/users/importable/")) return importLimit;
        if (path.startsWith("/uploads/")) return defaultLimit;
        if (!path.startsWith("/api/")) return 0;
        return "GET".equalsIgnoreCase(request.getMethod()) ? defaultLimit : writeLimit;
    }

    private boolean allow(String key, int limit) {
        long now = Instant.now().getEpochSecond();
        if (requests.incrementAndGet() % 256 == 0 || windows.size() >= MAX_TRACKED_CLIENTS) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().startedAt >= WINDOW_SECONDS);
            if (!windows.containsKey(key) && windows.size() >= MAX_TRACKED_CLIENTS) return false;
        }
        RequestWindow window = windows.compute(key, (ignored, existing) -> {
            if (existing == null || now - existing.startedAt >= WINDOW_SECONDS) return new RequestWindow(now, 1);
            return new RequestWindow(existing.startedAt, existing.requests + 1);
        });
        return window.requests <= limit;
    }

    /**
     * A request only gets its own bucket when it carries a token we signed; anything else
     * (no header, forged or expired token) is counted against its IP address, so rotating
     * random Authorization headers can neither bypass the limit nor fill the window table.
     */
    private String clientKey(HttpServletRequest request) {
        String ip = "ip:" + request.getRemoteAddr();
        String authorization = request.getHeader("Authorization");
        if (authorization == null || authorization.isBlank()) return ip;
        if (tokenService == null) return "auth:" + digest(authorization, ip);
        String token = authorization.startsWith("Bearer ") ? authorization.substring(7) : null;
        String openId = tokenService.verify(token);
        return openId == null ? ip : "user:" + digest(openId, ip);
    }

    private String digest(String value, String fallback) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest).substring(0, 16);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private record RequestWindow(long startedAt, int requests) { }
}
