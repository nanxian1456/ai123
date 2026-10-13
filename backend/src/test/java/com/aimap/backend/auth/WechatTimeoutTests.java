package com.aimap.backend.auth;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.ObjectMapper;
import java.net.http.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WechatTimeoutTests {
    @Test void providerConnectionHasFiniteTimeout() {
        var service = new WechatAuthService(new WechatProperties("app", "test-secret"), new ObjectMapper());
        var client = (HttpClient) ReflectionTestUtils.getField(service, "httpClient");
        assertTrue(client.connectTimeout().isPresent());
    }
    @Test void providerRequestHasFiniteTimeout() throws Exception {
        HttpClient client = mock(HttpClient.class);
        var service = new WechatAuthService(new WechatProperties("app", "test-secret", 3, 7), new ObjectMapper(), client);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"openid\":\"owner\"}");
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenAnswer(invocation -> {
            HttpRequest request = invocation.getArgument(0);
            assertEquals(java.time.Duration.ofSeconds(7), request.timeout().orElseThrow());
            return response;
        });
        assertEquals("owner",service.exchangeCode("code"));
    }
}
