package com.aimap.backend.config;

import com.aimap.backend.auth.AuthInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final AuthInterceptor authInterceptor;
    private final String avatarStorageDirectory;
    private final String[] allowedOriginPatterns;

    public WebConfig(
            AuthInterceptor authInterceptor,
            @Value("${avatar.storage-dir}") String avatarStorageDirectory,
            @Value("${cors.allowed-origin-patterns}") String allowedOriginPatterns
    ) {
        this.authInterceptor = authInterceptor;
        this.avatarStorageDirectory = avatarStorageDirectory;
        this.allowedOriginPatterns = Arrays.stream(allowedOriginPatterns.split(",")).map(String::trim).filter(value -> !value.isBlank()).toArray(String[]::new);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(allowedOriginPatterns)
                .allowedMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*");
        registry.addMapping("/videos/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "OPTIONS")
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
        registry.addResourceHandler("/videos/**").addResourceLocations("classpath:/static/videos/");
    }
}
