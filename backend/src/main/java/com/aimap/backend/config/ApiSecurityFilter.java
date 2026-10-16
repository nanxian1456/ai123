package com.aimap.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
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
    private final Map<String, RequestWindow> windows = new ConcurrentHashMap<>();
    private final AtomicLong requests = new AtomicLong();
    private final int defaultLimit;
    private final int writeLimit;
    private final int aiLimit;
    private final int importLimit;

    public ApiSecurityFilter(
            @Value("${api.rate-limit.default-per-minute:120}") int defaultLimit,
            @Value("${api.rate-limit.write-per-minute:60}") int writeLimit,
            @Value("${api.rate-limit.ai-per-minute:10}") int aiLimit,
            @Value("${api.rate-limit.import-per-minute:30}") int importLimit
    ) {
        this.defaultLimit = defaultLimit;
        this.writeLimit = writeLimit;
        this.aiLimit = aiLimit;
        this.importLimit = importLimit;
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
        if ("/api/me/avatar".equals(path)) return 12;
        if ("/api/ai/extract".equals(path)) return aiLimit;
        if (path.startsWith("/api/users/importable/")) return importLimit;
        if (!path.startsWith("/api/")) return 0;
        return "GET".equalsIgnoreCase(request.getMethod()) ? defaultLimit : writeLimit;
    }

    private boolean allow(String key, int limit) {
        long now = Instant.now().getEpochSecond();
        if (requests.incrementAndGet() % 256 == 0 || windows.size() >= 10_000) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().startedAt >= WINDOW_SECONDS);
            if (!windows.containsKey(key) && windows.size() >= 10_000) return false;
        }
        RequestWindow window = windows.compute(key, (ignored, existing) -> {
            if (existing == null || now - existing.startedAt >= WINDOW_SECONDS) return new RequestWindow(now, 1);
            return new RequestWindow(existing.startedAt, existing.requests + 1);
        });
        return window.requests <= limit;
    }

    private String clientKey(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        if (authorization == null || authorization.isBlank()) return request.getRemoteAddr();
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(authorization.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest).substring(0, 16);
        } catch (Exception ignored) {
            return request.getRemoteAddr();
        }
    }

    private record RequestWindow(long startedAt, int requests) { }
}
