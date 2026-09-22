package com.aimap.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {
    private static final Logger logger = LoggerFactory.getLogger(RequestLoggingFilter.class);

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String requestId = requestId(request.getHeader("X-Request-Id"));
        long startedAt = System.nanoTime();
        MDC.put("requestId", requestId);
        response.setHeader("X-Request-Id", requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            if (request.getRequestURI().startsWith("/api/")) {
                logger.info("{} {} -> {} ({} ms)", request.getMethod(), safePath(request.getRequestURI()), response.getStatus(), (System.nanoTime() - startedAt) / 1_000_000);
            }
            MDC.remove("requestId");
        }
    }

    private String requestId(String candidate) {
        return candidate != null && candidate.matches("[A-Za-z0-9_-]{8,64}") ? candidate : UUID.randomUUID().toString();
    }

    private String safePath(String path) {
        return path.startsWith("/api/users/importable/") ? "/api/users/importable/***" : path;
    }
}
