package com.aimap.backend.profile;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PublishedProfileRequest(
        @NotNull Boolean published,
        @Size(max = 30) String nickname,
        @Size(max = 100) String organization,
        @Size(max = 100) String position,
        @Size(max = 100) String city,
        @Size(max = 500) String bio
) { }
