package com.aimap.backend.ai;

import java.util.List;

public record AiExtractedContact(
        String name,
        String organization,
        String position,
        String city,
        String province,
        String phone,
        String email,
        String note,
        List<String> tags,
        String sourceText
) { }
