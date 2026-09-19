package com.aimap.backend.config;

import com.aimap.backend.auth.AuthInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final AuthInterceptor authInterceptor;
    private final String avatarStorageDirectory;

    public WebConfig(AuthInterceptor authInterceptor, @Value("${avatar.storage-dir}") String avatarStorageDirectory) {
        this.authInterceptor = authInterceptor;
        this.avatarStorageDirectory = avatarStorageDirectory;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }

    @Override
    public void addInterceptors(org.springframework.web.servlet.config.annotation.InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor).addPathPatterns("/api/**").excludePathPatterns("/api/auth/**");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = java.nio.file.Path.of(avatarStorageDirectory).toAbsolutePath().normalize().toUri().toString();
        registry.addResourceHandler("/uploads/avatars/**").addResourceLocations(location);
    }
}
