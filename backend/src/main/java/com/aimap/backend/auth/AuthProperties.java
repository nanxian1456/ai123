package com.aimap.backend.auth;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@ConfigurationProperties(prefix = "auth")
@Validated
public record AuthProperties(@NotBlank(message = "AUTH_TOKEN_SECRET is required") String tokenSecret, long tokenTtlHours) { }
