package com.aimap.backend.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ai.extraction")
public record AiExtractionProperties(String apiKey, String baseUrl, String model, int timeoutSeconds) {
    public boolean configured() {
        return apiKey != null && !apiKey.isBlank()
                && baseUrl != null && !baseUrl.isBlank()
                && model != null && !model.isBlank();
    }
}
