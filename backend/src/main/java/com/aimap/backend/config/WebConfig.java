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
    private final String[] allowedOriginPatterns;

    public WebConfig(
            AuthInterceptor authInterceptor,
            @Value("${cors.allowed-origin-patterns}") String allowedOriginPatterns
    ) {
        this.authInterceptor = authInterceptor;
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
        // Legacy avatars are served by LegacyAvatarController and require the owner's token.
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**", "/uploads/avatars/**")
                .excludePathPatterns("/api/auth/**");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/videos/**").addResourceLocations("classpath:/static/videos/");
    }
}
