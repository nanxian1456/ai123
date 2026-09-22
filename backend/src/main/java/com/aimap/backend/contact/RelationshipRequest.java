package com.aimap.backend.contact;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record RelationshipRequest(
        @NotNull @Positive Long sourceId,
        @NotNull @Positive Long targetId,
        @NotBlank @Size(max = 30) String type,
        @Size(max = 200) String note
) {}
