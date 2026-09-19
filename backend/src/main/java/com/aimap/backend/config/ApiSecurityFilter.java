package com.aimap.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ApiSecurityFilter extends OncePerRequestFilter {
    private static final long WINDOW_SECONDS = 60;
    private final Map<String, RequestWindow> windows = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "no-referrer");

        int limit = limitFor(request.getRequestURI());
        if (limit > 0 && !allow(request.getRequestURI() + ":" + request.getRemoteAddr(), limit)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", String.valueOf(WINDOW_SECONDS));
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"detail\":\"请求过于频繁，请稍后再试\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    private int limitFor(String path) {
        if ("/api/auth/wechat-login".equals(path)) return 10;
        if ("/api/me/avatar".equals(path)) return 12;
        return 0;
    }

    private boolean allow(String key, int limit) {
        long now = Instant.now().getEpochSecond();
        if (windows.size() >= 10_000) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().startedAt >= WINDOW_SECONDS);
            if (!windows.containsKey(key) && windows.size() >= 10_000) return false;
        }
        RequestWindow window = windows.compute(key, (ignored, existing) -> {
            if (existing == null || now - existing.startedAt >= WINDOW_SECONDS) return new RequestWindow(now, 1);
            return new RequestWindow(existing.startedAt, existing.requests + 1);
        });
        return window.requests <= limit;
    }

    private record RequestWindow(long startedAt, int requests) { }
}
