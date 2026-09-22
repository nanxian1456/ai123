package com.aimap.backend.error;

import java.time.Instant;
import java.util.Map;

public record ApiError(
        Instant timestamp,
        int status,
        String code,
        String message,
        String path,
        String requestId,
        Map<String, String> fieldErrors
) { }
