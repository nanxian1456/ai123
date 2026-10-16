package com.aimap.backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.HandlerInterceptor;
import org.slf4j.MDC;

import java.io.IOException;

@Component
public class AuthInterceptor implements HandlerInterceptor {
    private static final Logger logger = LoggerFactory.getLogger(AuthInterceptor.class);
    private final TokenService tokenService;
    public AuthInterceptor(TokenService tokenService) { this.tokenService = tokenService; }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        String token = header != null && header.startsWith("Bearer ") ? header.substring(7) : null;
        String openId = tokenService.verify(token);
        if (openId == null) {
            String path = request.getRequestURI().startsWith("/api/users/importable/") ? "/api/users/importable/***" : request.getRequestURI();
            logger.warn("未授权 API 请求: {} from {}", path, request.getRemoteAddr());
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType("application/json;charset=UTF-8");
            String requestId = MDC.get("requestId");
            response.getWriter().write("{\"status\":401,\"code\":\"UNAUTHORIZED\",\"message\":\"未登录或登录已过期\",\"requestId\":\"" + (requestId == null ? "" : requestId) + "\"}");
            return false;
        }
        request.setAttribute("currentOpenId", openId);
        return true;
    }
}
