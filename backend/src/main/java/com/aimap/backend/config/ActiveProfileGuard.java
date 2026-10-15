package com.aimap.backend.config;

import org.springframework.core.env.Environment;

/**
 * Compatibility entry point for earlier desktop callers. Spring registers the more complete
 * DeploymentEnvironmentGuard; this class must not register a second environment guard.
 */
@Deprecated
public class ActiveProfileGuard {
    public ActiveProfileGuard(Environment environment) {
        new DeploymentEnvironmentGuard(environment);
    }
}
