package com.aimap.backend.ai;

import com.aimap.backend.error.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.ObjectMapper;

import java.util.Base64;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import com.sun.net.httpserver.HttpServer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

class BusinessCardVisionServiceTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final AiExtractionService extraction = new AiExtractionService(
            new AiExtractionProperties("", "https://example.test", "text", 2), mapper);
    private final BusinessCardVisionService service = new BusinessCardVisionService(
            new VisionProperties("", "", "", 2), extraction, mapper);

    @Test
    void rejectsInvalidImageBeforeCallingProvider() {
        MockMultipartFile file = new MockMultipartFile("file", "card.jpg", "image/jpeg", "not an image".getBytes());
        assertThrows(ApiException.class, () -> service.recognize(file));
    }

    @Test
    void requiresExplicitVisionProviderForValidCard() {
        byte[] png = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=");
        MockMultipartFile file = new MockMultipartFile("file", "card.png", "image/png", png);
        assertThrows(ApiException.class, () -> service.recognize(file));
    }

    @Test
    void sendsImageToConfiguredVisionProviderAndReturnsPreview() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat/completions", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            String response = "{\"choices\":[{\"message\":{\"content\":\"{\\\"name\\\":\\\"小王\\\",\\\"organization\\\":\\\"测试公司\\\"}\"}}]}";
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            byte[] png = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=");
            MockMultipartFile file = new MockMultipartFile("file", "card.png", "image/png", png);
            BusinessCardVisionService configured = new BusinessCardVisionService(
                    new VisionProperties("test-key", "http://127.0.0.1:" + server.getAddress().getPort(), "vision", 3), extraction, mapper);
            AiExtractionResponse result = configured.recognize(file);
            assertEquals("小王", result.data().name());
            assertTrue(requestBody.get().contains("data:image/png;base64,"));
        } finally { server.stop(0); }
    }
}
