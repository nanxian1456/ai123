package com.aimap.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistration;
import static org.mockito.Mockito.*;

class AvatarRoutingTests {
    @Test void doesNotExposeAvatarStorageThroughAnonymousStaticHandler() {
        ResourceHandlerRegistry registry = mock(ResourceHandlerRegistry.class);
        when(registry.addResourceHandler(any(String[].class))).thenReturn(mock(ResourceHandlerRegistration.class));
        new WebConfig(null, "test-avatars", "http://localhost").addResourceHandlers(registry);
        verify(registry, never()).addResourceHandler("/uploads/avatars/**");
    }
}
