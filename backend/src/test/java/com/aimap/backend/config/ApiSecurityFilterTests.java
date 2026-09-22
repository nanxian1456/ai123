package com.aimap.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApiSecurityFilterTests {
    @Test
    void limitsAuthenticatedApiRequestsWithoutExposingToken() throws Exception {
        ApiSecurityFilter filter = new ApiSecurityFilter(1, 1, 1, 1);

        MockHttpServletResponse first = execute(filter);
        MockHttpServletResponse second = execute(filter);

        assertEquals(200, first.getStatus());
        assertEquals(429, second.getStatus());
        assertEquals("60", second.getHeader("Retry-After"));
        assertTrue(second.getContentAsString().contains("RATE_LIMITED"));
        assertTrue(!second.getContentAsString().contains("secret-token"));
    }

    private MockHttpServletResponse execute(ApiSecurityFilter filter) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/contacts");
        request.setRequestURI("/api/contacts");
        request.addHeader("Authorization", "Bearer secret-token");
        request.setRemoteAddr("127.0.0.1");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
