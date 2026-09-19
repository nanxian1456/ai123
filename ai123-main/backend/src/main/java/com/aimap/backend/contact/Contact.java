package com.aimap.backend.contact;

import java.util.List;

public record Contact(
        Long id,
        String ownerId,
        String name,
        String organization,
        String position,
        String city,
        String province,
        String phone,
        String email,
        String note,
        List<String> tags
) {}
