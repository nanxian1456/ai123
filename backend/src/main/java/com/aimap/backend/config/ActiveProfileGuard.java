package com.aimap.backend.config;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Refuses to start without an explicitly chosen environment. Previously the app silently
 * fell back to the dev profile (local H2 database and the developer's local secrets) when a
 * deployment forgot to pass --spring.profiles.active=prod.
 */
@Component
public class ActiveProfileGuard {
    public ActiveProfileGuard(Environment environment) {
        if (environment.getActiveProfiles().length == 0) {
            throw new IllegalStateException("未指定运行环境：开发请使用 dev（.\\start.ps1 -Profile dev 或 mvnw spring-boot:run），"
                    + "部署请使用 --spring.profiles.active=prod");
        }
    }
}
