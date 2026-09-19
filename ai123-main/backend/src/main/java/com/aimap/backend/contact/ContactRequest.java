package com.aimap.backend.contact;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ContactRequest(
        @NotBlank(message = "姓名不能为空") @Size(max = 50) String name,
        @Size(max = 100) String organization,
        @Size(max = 50) String position,
        @Size(max = 50) String city,
        @Size(max = 50) String province,
        @Size(max = 30) String phone,
        @Size(max = 100) String email,
        @Size(max = 500) String note,
        List<@Size(max = 20) String> tags
) {}
