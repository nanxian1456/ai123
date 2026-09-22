package com.aimap.backend.contact;

import com.aimap.backend.error.ApiException;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

@Service
public class InsightService {
    private final ContactService contacts;

    public InsightService(ContactService contacts) { this.contacts = contacts; }

    @Cacheable(cacheNames = "contactInsights", key = "'dashboard:' + #ownerId")
    public Map<String, Object> dashboard(String ownerId) {
        List<Contact> all = contacts.findAll(ownerId);
        long organizations = all.stream().map(Contact::organization).filter(s -> !s.isBlank()).distinct().count();
        long cities = all.stream().map(Contact::city).filter(s -> !s.isBlank()).distinct().count();
        return Map.of("contactCount", all.size(), "organizationCount", organizations, "cityCount", cities,
                "recentContacts", all.stream().sorted(Comparator.comparing(Contact::id).reversed()).limit(3).toList());
    }

    @Cacheable(cacheNames = "contactInsights", key = "'cities:' + #ownerId")
    public List<Map<String, Object>> cities(String ownerId) {
        return counts(contacts.findAll(ownerId).stream().map(Contact::city).filter(value -> !value.isBlank()).toList());
    }

    @Cacheable(cacheNames = "contactInsights", key = "'tags:' + #ownerId")
    public List<Map<String, Object>> tags(String ownerId) {
        return counts(contacts.findAll(ownerId).stream().flatMap(contact -> contact.tags().stream()).toList());
    }

    @Cacheable(cacheNames = "contactInsights", key = "'organizations:' + #ownerId")
    public List<Map<String, Object>> organizations(String ownerId) {
        return counts(contacts.findAll(ownerId).stream().map(Contact::organization).filter(value -> !value.isBlank()).toList());
    }

    public List<Map<String, Object>> contactRelationships(String ownerId, Long id) {
        requireContact(ownerId, id);
        return contacts.relationshipsFor(ownerId).stream()
                .filter(relationship -> relationship.sourceId().equals(id) || relationship.targetId().equals(id))
                .map(relationship -> relationshipView(ownerId, id, relationship))
                .toList();
    }

    public Map<String, Object> graph(String ownerId, Long id) {
        requireContact(ownerId, id);
        List<Relationship> edges = contacts.relationshipsFor(ownerId).stream()
                .filter(relationship -> relationship.sourceId().equals(id) || relationship.targetId().equals(id)).toList();
        Set<Long> ids = new LinkedHashSet<>();
        ids.add(id);
        edges.forEach(edge -> { ids.add(edge.sourceId()); ids.add(edge.targetId()); });
        List<Map<String, Object>> nodes = ids.stream().map(contactId -> {
            Contact contact = requireContact(ownerId, contactId);
            return Map.<String, Object>of("id", contact.id(), "name", contact.name(), "organization", contact.organization(), "isCenter", contact.id().equals(id));
        }).toList();
        return Map.of("nodes", nodes, "edges", edges);
    }

    private Map<String, Object> relationshipView(String ownerId, Long id, Relationship relationship) {
        boolean outgoing = relationship.sourceId().equals(id);
        Contact other = requireContact(ownerId, outgoing ? relationship.targetId() : relationship.sourceId());
        String label = outgoing ? relationship.type() : reverseLabel(relationship.type());
        String summary = relationship.note().isBlank() ? other.organization()
                : other.organization().isBlank() ? relationship.note() : other.organization() + " · " + relationship.note();
        return Map.of("id", relationship.id(), "type", relationship.type(), "label", label, "summary", summary,
                "other", Map.of("id", other.id(), "name", other.name(), "organization", other.organization()));
    }

    private Contact requireContact(String ownerId, Long id) {
        Contact contact = contacts.findOne(ownerId, id);
        if (contact == null) throw new ApiException(HttpStatus.NOT_FOUND, "CONTACT_NOT_FOUND", "联系人不存在");
        return contact;
    }

    private List<Map<String, Object>> counts(List<String> values) {
        Map<String, Long> counts = new TreeMap<>();
        values.forEach(value -> counts.merge(value, 1L, Long::sum));
        return counts.entrySet().stream().map(entry -> Map.<String, Object>of("name", entry.getKey(), "count", entry.getValue())).toList();
    }

    private String reverseLabel(String type) {
        return switch (type) {
            case "指导" -> "导师";
            case "导师", "学生" -> "指导";
            default -> type;
        };
    }
}
