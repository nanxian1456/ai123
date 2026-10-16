package com.aimap.backend.config;

import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.net.URI;

@Component
public class DeploymentEnvironmentGuard {
    public DeploymentEnvironmentGuard(Environment environment) {
        boolean development = environment.acceptsProfiles(Profiles.of("dev"));
        boolean production = environment.acceptsProfiles(Profiles.of("prod"));
        boolean test = environment.acceptsProfiles(Profiles.of("test"));
        if ((!development && !production && !test) || (production && (development || test))) {
            throw new IllegalStateException("必须显式选择 dev 或 prod 运行环境，生产环境不能混用开发或测试配置");
        }
        if (!production) return;
        for (String name : new String[]{"spring.datasource.url", "spring.datasource.username", "spring.datasource.password",
                "auth.token-secret", "wechat.mini-program.app-id", "wechat.mini-program.app-secret", "app.public-base-url"}) {
            if (environment.getProperty(name, "").isBlank()) {
                throw new IllegalStateException("生产环境缺少必要配置: " + name);
            }
        }
        if (!environment.getProperty("spring.datasource.url", "").startsWith("jdbc:postgresql://")) {
            throw new IllegalStateException("生产环境必须配置 PostgreSQL 数据库");
        }
        URI publicUrl;
        try { publicUrl = URI.create(environment.getProperty("app.public-base-url", "")); }
        catch (IllegalArgumentException exception) { throw new IllegalStateException("生产环境公开地址必须是有效 HTTPS 地址"); }
        if (!"https".equalsIgnoreCase(publicUrl.getScheme()) || publicUrl.getHost() == null || publicUrl.getUserInfo() != null) {
            throw new IllegalStateException("生产环境公开地址必须是有效 HTTPS 地址");
        }
    }
}
