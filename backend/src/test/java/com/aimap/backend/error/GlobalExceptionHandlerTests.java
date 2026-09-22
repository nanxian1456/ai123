package com.aimap.backend.error;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GlobalExceptionHandlerTests {
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void returnsStableErrorShapeWithRequestId() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/contacts/999");
        request.setRequestURI("/api/contacts/999");
        MDC.put("requestId", "request-123");
        try {
            var response = handler.handleApi(
                    new ApiException(HttpStatus.NOT_FOUND, "CONTACT_NOT_FOUND", "联系人不存在"), request);

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("CONTACT_NOT_FOUND", response.getBody().code());
            assertEquals("request-123", response.getBody().requestId());
        } finally {
            MDC.remove("requestId");
        }
    }
}
