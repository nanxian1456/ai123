package com.aimap.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = "auth.token-secret=test-only-token-secret-not-for-production")
class AiNetworkBackendApplicationTests {
	@Autowired
	@Qualifier("requestMappingHandlerMapping")
	private RequestMappingHandlerMapping routes;

	@Test
	void contextLoads() {
	}

	@Test
	void cardRecognitionIsNotRegisteredButTextExtractionRemains() {
		var paths = routes.getHandlerMethods().keySet().stream()
				.flatMap(mapping -> mapping.getPatternValues().stream()).toList();
		assertFalse(paths.contains("/api/ai/recognize-card"));
		assertTrue(paths.contains("/api/ai/extract"));
	}

}
