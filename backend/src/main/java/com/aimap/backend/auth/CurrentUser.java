package com.aimap.backend.auth;

import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

public final class CurrentUser {
    private CurrentUser() { }
    public static String openId() {
        Object value = RequestContextHolder.currentRequestAttributes().getAttribute("currentOpenId", RequestAttributes.SCOPE_REQUEST);
        if (value instanceof String openId) return openId;
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "未登录或登录已过期");
    }
}
