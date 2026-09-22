package com.aimap.backend.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AiExtractionRequest(
        @NotBlank(message = "待提取文本不能为空")
        @Size(max = 4000, message = "待提取文本不能超过 4000 个字符")
        String text
) { }
