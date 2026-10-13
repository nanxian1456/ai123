package com.aimap.backend.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties(prefix = "wechat.mini-program")
public record WechatProperties(String appId, String appSecret, Integer connectTimeoutSeconds, Integer requestTimeoutSeconds) {
    public WechatProperties(String appId, String appSecret) { this(appId, appSecret, 5, 10); }
    @ConstructorBinding
    public WechatProperties {
        if (connectTimeoutSeconds == null) connectTimeoutSeconds = 5;
        if (requestTimeoutSeconds == null) requestTimeoutSeconds = 10;
        if (connectTimeoutSeconds < 1 || requestTimeoutSeconds < 1) throw new IllegalArgumentException("WeChat timeouts must be positive");
    }
    public boolean configured() {
        return appId != null && !appId.isBlank() && appSecret != null && !appSecret.isBlank();
    }
}
