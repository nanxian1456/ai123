package com.aimap.backend.config;

import com.aimap.backend.auth.TokenService;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;
import org.slf4j.MDC;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class ApiSecurityFilter extends OncePerRequestFilter {
    private final Cache<String, RequestWindow> windows = Caffeine.newBuilder().maximumSize(10_000).expireAfterWrite(Duration.ofMinutes(1)).build();
    private final TokenService tokens;
    private final int defaultLimit, writeLimit, aiLimit, importLimit, accountDailyLimit, globalDailyLimit;
    private final boolean legacyWriteEnabled;
    private final Map<String, Integer> dailyAccounts = new HashMap<>();
    private long quotaDay = -1;
    private int dailyTotal;

    public ApiSecurityFilter(int defaultLimit, int writeLimit, int aiLimit, int importLimit) {
        this(null, defaultLimit, writeLimit, aiLimit, importLimit, 20, 200, false);
    }

    @Autowired
    public ApiSecurityFilter(TokenService tokens,
            @Value("${api.rate-limit.default-per-minute:120}") int defaultLimit,
            @Value("${api.rate-limit.write-per-minute:60}") int writeLimit,
            @Value("${api.rate-limit.ai-per-minute:10}") int aiLimit,
            @Value("${api.rate-limit.import-per-minute:30}") int importLimit,
            @Value("${api.ai-quota.account-per-day:20}") int accountDailyLimit,
            @Value("${api.ai-quota.global-per-day:200}") int globalDailyLimit,
            @Value("${legacy.write-enabled:false}") boolean legacyWriteEnabled) {
        if (accountDailyLimit < 1 || globalDailyLimit < 1) throw new IllegalArgumentException("AI daily quotas must be positive");
        this.tokens = tokens;
        this.defaultLimit = defaultLimit; this.writeLimit = writeLimit;
        this.aiLimit = aiLimit; this.importLimit = importLimit;
        this.accountDailyLimit = accountDailyLimit; this.globalDailyLimit = globalDailyLimit;
        this.legacyWriteEnabled = legacyWriteEnabled;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "no-referrer");
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) { chain.doFilter(request, response); return; }
        // Decode the raw request URI once and remove MVC path parameters before security decisions.
        String path = UrlPathHelper.defaultInstance.getPathWithinApplication(request).replaceAll("/+$", "");
        boolean read = "GET".equalsIgnoreCase(request.getMethod()) || "HEAD".equalsIgnoreCase(request.getMethod());
        if (!legacyWriteEnabled && !read && (path.equals("/api/contacts") || path.startsWith("/api/contacts/")
                || path.equals("/api/relationships") || path.startsWith("/api/relationships/")
                || path.equals("/api/me") || path.equals("/api/me/visibility") || path.equals("/api/me/avatar"))) {
            reject(response, 403, "LEGACY_WRITE_DISABLED", "旧版写接口已停用", 0); return;
        }
        String owner = verifiedOwner(request);
        String category;
        int limit;
        if (path.equals("/api/auth/wechat-login")) { category = "login"; limit = 10; }
        else if (path.equals("/api/me/avatar") && !read) { category = "avatar"; limit = 12; }
        else if (path.equals("/api/ai/extract")) { category = "ai"; limit = aiLimit; }
        else if (path.startsWith("/api/users/importable/")) { category = "import"; limit = importLimit; }
        else if (path.startsWith("/api/")) { category = read ? "read" : "write"; limit = read ? defaultLimit : writeLimit; }
        else { chain.doFilter(request, response); return; }
        // Forwarding headers are interpreted only by explicitly trusted deployment infrastructure.
        String identity = category.equals("login") || owner == null ? "ip:" + request.getRemoteAddr() : "owner:" + owner;
        if (limit > 0 && !allow(category + ":" + identity, limit)) {
            reject(response, 429, "RATE_LIMITED", "请求过于频繁，请稍后再试", 60); return;
        }
        if (category.equals("ai") && !read && owner != null && !allowDaily(owner)) {
            long remaining = 86400 - Instant.now().getEpochSecond() % 86400;
            reject(response, 429, "AI_DAILY_QUOTA_EXCEEDED", "今日 AI 使用次数已达上限", remaining); return;
        }
        chain.doFilter(request, response);
    }

    private String verifiedOwner(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        return tokens == null || header == null || !header.startsWith("Bearer ") ? null : tokens.verify(header.substring(7));
    }

    private boolean allow(String key, int limit) {
        long now = Instant.now().getEpochSecond();
        RequestWindow window = windows.asMap().compute(key, (ignored, previous) ->
                previous == null || now - previous.startedAt >= 60
                        ? new RequestWindow(now, 1) : new RequestWindow(previous.startedAt, Math.min(limit + 1, previous.requests + 1)));
        return window.requests <= limit;
    }

    private synchronized boolean allowDaily(String owner) {
        long day = Instant.now().getEpochSecond() / 86400;
        if (day != quotaDay) { quotaDay = day; dailyTotal = 0; dailyAccounts.clear(); }
        int used = dailyAccounts.getOrDefault(owner, 0);
        if (used >= accountDailyLimit || dailyTotal >= globalDailyLimit) return false;
        // Admitted accounts cannot exceed the positive global daily budget, bounding this map.
        dailyAccounts.put(owner, used + 1); dailyTotal++; return true;
    }

    private void reject(HttpServletResponse response, int status, String code, String message, long retryAfter) throws IOException {
        response.setStatus(status);
        if (retryAfter > 0) response.setHeader("Retry-After", Long.toString(retryAfter));
        response.setContentType("application/json;charset=UTF-8");
        String requestId = MDC.get("requestId");
        requestId = requestId != null && requestId.matches("[A-Za-z0-9_-]{8,64}") ? requestId : "";
        response.getWriter().write("{\"status\":" + status + ",\"code\":\"" + code + "\",\"message\":\"" + message + "\",\"requestId\":\"" + requestId + "\"}");
    }
    private record RequestWindow(long startedAt, int requests) { }
}
