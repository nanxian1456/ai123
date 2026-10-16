package com.aimap.backend.ai;

import com.aimap.backend.error.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class AiExtractionService {
    private static final Logger logger = LoggerFactory.getLogger(AiExtractionService.class);
    private static final String SYSTEM_PROMPT = """
            你是联系人信息提取器。只输出 JSON 对象，不要输出解释或 Markdown。
            字段必须包含 name、organization、position、city、province、phone、email、note、tags。
            无法确定的字符串使用空字符串，tags 使用字符串数组且最多 10 项。不要虚构输入中不存在的信息。
            """;

    private final AiExtractionProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public AiExtractionService(AiExtractionProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(Math.max(1, properties.timeoutSeconds())))
                .build();
    }

    public AiExtractionResponse extract(String sourceText) {
        if (!properties.configured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_NOT_CONFIGURED", "AI 提取服务尚未配置");
        }
        long startedAt = System.nanoTime();
        try {
            String requestBody = objectMapper.writeValueAsString(Map.of(
                    "model", properties.model(),
                    "temperature", 0,
                    "response_format", Map.of("type", "json_object"),
                    "messages", List.of(
                            Map.of("role", "system", "content", SYSTEM_PROMPT),
                            Map.of("role", "user", "content", sourceText)
                    )
            ));
            HttpRequest request = HttpRequest.newBuilder(endpoint())
                    .timeout(Duration.ofSeconds(Math.max(1, properties.timeoutSeconds())))
                    .header("Authorization", "Bearer " + properties.apiKey())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                logger.warn("AI extraction provider returned status {}", response.statusCode());
                throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_PROVIDER_ERROR", "AI 提取服务暂时不可用");
            }
            JsonNode root = objectMapper.readTree(response.body());
            String content = root.path("choices").path(0).path("message").path("content").asText("");
            if (content.isBlank()) throw new IllegalArgumentException("AI response content is empty");
            AiExtractedContact data = parseContent(content, sourceText);
            logger.info("AI extraction completed in {} ms", (System.nanoTime() - startedAt) / 1_000_000);
            return new AiExtractionResponse("ai", "信息提取完成，请核对后保存", data);
        } catch (ApiException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_REQUEST_INTERRUPTED", "AI 提取请求已中断");
        } catch (Exception exception) {
            logger.error("AI extraction failed", exception);
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_RESPONSE_INVALID", "AI 提取服务返回异常，请稍后重试");
        }
    }

    AiExtractedContact parseContent(String content, String sourceText) {
        try {
            String json = stripCodeFence(content);
            JsonNode data = objectMapper.readTree(json);
            List<String> tags = new ArrayList<>();
            JsonNode tagNode = data.path("tags");
            if (tagNode.isArray()) {
                for (JsonNode tag : tagNode) {
                    String value = limit(tag.asText("").trim(), 20);
                    if (!value.isBlank() && !tags.contains(value) && tags.size() < 10) tags.add(value);
                }
            }
            return new AiExtractedContact(
                    value(data, "name", 50), value(data, "organization", 100), value(data, "position", 50),
                    value(data, "city", 50), value(data, "province", 50), value(data, "phone", 30),
                    value(data, "email", 100), value(data, "note", 500), List.copyOf(tags), sourceText
            );
        } catch (Exception exception) {
            throw new IllegalArgumentException("AI response is not valid JSON", exception);
        }
    }

    private URI endpoint() {
        String base = properties.baseUrl().replaceAll("/+$", "");
        return URI.create(base.endsWith("/chat/completions") ? base : base + "/chat/completions");
    }

    private String value(JsonNode data, String field, int maxLength) {
        return limit(data.path(field).asText("").trim(), maxLength);
    }

    private String limit(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private String stripCodeFence(String content) {
        String value = content.trim();
        if (!value.startsWith("```")) return value;
        int firstLine = value.indexOf('\n');
        int lastFence = value.lastIndexOf("```");
        return firstLine >= 0 && lastFence > firstLine ? value.substring(firstLine + 1, lastFence).trim() : value;
    }
}
