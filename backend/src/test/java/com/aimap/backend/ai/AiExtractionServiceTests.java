package com.aimap.backend.ai;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import com.aimap.backend.error.ApiException;

class AiExtractionServiceTests {
    private final AiExtractionService service = new AiExtractionService(
            new AiExtractionProperties("test-key", "https://example.test/v1", "test-model", 2),
            new ObjectMapper()
    );

    @Test
    void parsesStructuredProviderResponseWithoutInventingFields() {
        String response = """
                ```json
                {"name":"小王","organization":"南京邮电大学","position":"学生","city":"南京","province":"江苏","phone":"","email":"","note":"校友","tags":["校友","人工智能"]}
                ```
                """;

        AiExtractedContact result = service.parseContent(response, "原始文本");

        assertEquals("小王", result.name());
        assertEquals("南京邮电大学", result.organization());
        assertEquals(List.of("校友", "人工智能"), result.tags());
        assertEquals("原始文本", result.sourceText());
    }

    @Test
    void rejectsCallsWhenProviderIsNotConfigured() {
        AiExtractionService unconfigured = new AiExtractionService(
                new AiExtractionProperties("", "https://example.test/v1", "test-model", 2), new ObjectMapper());
        assertThrows(ApiException.class, () -> unconfigured.extract("联系人文本"));
    }
}
