package com.aimap.backend.contact;

import java.util.List;

public record ContactDirectoryItem(
        Long id,
        String name,
        String organization,
        String position,
        String city,
        String province,
        String phone,
        String email,
        String note,
        List<String> tags,
        String initial
) {
    static ContactDirectoryItem from(Contact contact, String initial) {
        return new ContactDirectoryItem(contact.id(), contact.name(), contact.organization(), contact.position(), contact.city(), contact.province(), contact.phone(), contact.email(), contact.note(), contact.tags(), initial);
    }
}
