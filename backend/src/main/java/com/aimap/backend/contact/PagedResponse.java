package com.aimap.backend.contact;

import org.springframework.data.domain.Page;

import java.util.List;

public record PagedResponse<T>(List<T> items, int page, int size, long totalElements, int totalPages) {
    public static <T> PagedResponse<T> from(Page<T> result) {
        return new PagedResponse<>(result.getContent(), result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }
}
