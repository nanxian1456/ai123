package com.aimap.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.*;

class DeploymentEnvironmentGuardTests {
    @Test
    void missingOrMixedRuntimeProfileIsRejected() {
        assertThrows(IllegalStateException.class, () -> new DeploymentEnvironmentGuard(new MockEnvironment()));
        MockEnvironment mixed = new MockEnvironment();
        mixed.setActiveProfiles("dev", "prod");
        assertThrows(IllegalStateException.class, () -> new DeploymentEnvironmentGuard(mixed));
    }

    @Test
    void testAndExplicitDevelopmentProfilesAreAllowed() {
        for (String profile : new String[]{"dev", "test"}) {
            MockEnvironment environment = new MockEnvironment();
            environment.setActiveProfiles(profile);
            assertDoesNotThrow(() -> new DeploymentEnvironmentGuard(environment));
        }
    }

    @Test
    void productionRequiresPostgresAndHttpsAndCredentials() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        assertThrows(IllegalStateException.class, () -> new DeploymentEnvironmentGuard(environment));
        environment.withProperty("spring.datasource.url", "jdbc:postgresql://localhost/aimap")
                .withProperty("spring.datasource.username", "test-user")
                .withProperty("spring.datasource.password", "test-only-password")
                .withProperty("auth.token-secret", "test-only-signing-secret")
                .withProperty("wechat.mini-program.app-id", "test-app")
                .withProperty("wechat.mini-program.app-secret", "test-only-secret")
                .withProperty("app.public-base-url", "http://localhost:8080");
        assertThrows(IllegalStateException.class, () -> new DeploymentEnvironmentGuard(environment));
        environment.withProperty("app.public-base-url", "https://example.invalid");
        assertDoesNotThrow(() -> new DeploymentEnvironmentGuard(environment));
    }
}
