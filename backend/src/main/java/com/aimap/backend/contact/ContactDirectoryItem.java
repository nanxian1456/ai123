package com.aimap.backend.contact;

import java.util.List;

public record ContactDirectoryItem(
        Long id,
        String name,
        String organization,
        String position,
        String city,
        String address,
        Double latitude,
        Double longitude,
        String province,
        String country,
        String phone,
        String email,
        String note,
        List<String> tags,
        String initial
) {
    static ContactDirectoryItem from(Contact contact, String initial) {
        return new ContactDirectoryItem(contact.id(), contact.name(), contact.organization(), contact.position(), contact.city(), contact.address(), contact.latitude(), contact.longitude(), contact.province(), contact.country(), contact.phone(), contact.email(), contact.note(), contact.tags(), initial);
    }
}
