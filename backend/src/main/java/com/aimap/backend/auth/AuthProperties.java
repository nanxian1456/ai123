package com.aimap.backend.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "auth")
public record AuthProperties(String tokenSecret, long tokenTtlHours) { }
