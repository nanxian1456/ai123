package com.aimap.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "auth.token-secret=test-only-token-secret-not-for-production")
class AiNetworkBackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
