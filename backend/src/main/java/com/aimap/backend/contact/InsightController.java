package com.aimap.backend.contact;

import com.aimap.backend.auth.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@RestController
@RequestMapping("/api")
public class InsightController {
    private final ContactStore store;
    public InsightController(ContactStore store) { this.store = store; }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        String ownerId = CurrentUser.openId();
        List<Contact> contacts = store.findAll(ownerId);
        long organizations = contacts.stream().map(Contact::organization).filter(s -> !s.isBlank()).distinct().count();
        long cities = contacts.stream().map(Contact::city).filter(s -> !s.isBlank()).distinct().count();
        return Map.of("contactCount", contacts.size(), "organizationCount", organizations, "cityCount", cities, "recentContacts", contacts.stream().sorted(Comparator.comparing(Contact::id).reversed()).limit(3).toList());
    }

    @GetMapping("/maps/cities")
    public List<Map<String, Object>> cities() {
        String ownerId = CurrentUser.openId();
        Map<String, Long> counts = new TreeMap<>();
        for (Contact contact : store.findAll(ownerId)) if (!contact.city().isBlank()) counts.merge(contact.city(), 1L, Long::sum);
        return counts.entrySet().stream().map(entry -> Map.<String, Object>of("name", entry.getKey(), "count", entry.getValue())).toList();
    }

    @GetMapping("/tags")
    public List<Map<String, Object>> tags() {
        String ownerId = CurrentUser.openId();
        Map<String, Long> counts = new TreeMap<>();
        for (Contact contact : store.findAll(ownerId)) {
            contact.tags().forEach(tag -> counts.merge(tag, 1L, Long::sum));
        }
        return counts.entrySet().stream().map(entry -> Map.<String, Object>of("name", entry.getKey(), "count", entry.getValue())).toList();
    }

    @GetMapping("/organizations")
    public List<Map<String, Object>> organizations() {
        String ownerId = CurrentUser.openId();
        Map<String, Long> counts = new TreeMap<>();
        for (Contact contact : store.findAll(ownerId)) {
            if (!contact.organization().isBlank()) counts.merge(contact.organization(), 1L, Long::sum);
        }
        return counts.entrySet().stream().map(entry -> Map.<String, Object>of("name", entry.getKey(), "count", entry.getValue())).toList();
    }

    @GetMapping("/contacts/{id}/relationships")
    public List<Map<String, Object>> contactRelationships(@PathVariable Long id) {
        String ownerId = CurrentUser.openId();
        if (store.findOne(ownerId, id) == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "联系人不存在");
        return store.relationshipsFor(ownerId).stream()
                .filter(relationship -> relationship.sourceId().equals(id) || relationship.targetId().equals(id))
                .map(relationship -> {
                    boolean outgoing = relationship.sourceId().equals(id);
                    Contact other = store.findOne(ownerId, outgoing ? relationship.targetId() : relationship.sourceId());
                    String label = outgoing ? relationship.type() : reverseLabel(relationship.type());
                    String summary = relationship.note().isBlank() ? other.organization() : other.organization().isBlank() ? relationship.note() : other.organization() + " · " + relationship.note();
                    return Map.<String, Object>of(
                            "id", relationship.id(), "type", relationship.type(), "label", label, "summary", summary,
                            "other", Map.of("id", other.id(), "name", other.name(), "organization", other.organization())
                    );
                }).toList();
    }

    @GetMapping("/graphs/contacts/{id}")
    public Map<String, Object> graph(@PathVariable Long id) {
        String ownerId = CurrentUser.openId();
        Contact center = store.findOne(ownerId, id);
        if (center == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "联系人不存在");
        List<Relationship> edges = store.relationshipsFor(ownerId).stream().filter(r -> r.sourceId().equals(id) || r.targetId().equals(id)).toList();
        Set<Long> ids = new LinkedHashSet<>(); ids.add(id);
        edges.forEach(r -> { ids.add(r.sourceId()); ids.add(r.targetId()); });
        List<Map<String, Object>> nodes = ids.stream().map(contactId -> {
            Contact contact = store.findOne(ownerId, contactId);
            return Map.<String, Object>of("id", contact.id(), "name", contact.name(), "organization", contact.organization(), "isCenter", contact.id().equals(id));
        }).toList();
        return Map.of("nodes", nodes, "edges", edges);
    }

    @PostMapping("/relationships")
    @ResponseStatus(HttpStatus.CREATED)
    public Relationship createRelationship(@jakarta.validation.Valid @RequestBody RelationshipRequest request) {
        Relationship relationship = store.saveRelationship(CurrentUser.openId(), request);
        if (relationship == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "关系对象无效");
        return relationship;
    }

    @DeleteMapping("/relationships/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRelationship(@PathVariable Long id) {
        if (!store.deleteRelationship(CurrentUser.openId(), id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "关系不存在");
    }

    @PostMapping("/ai/extract")
    public Map<String, Object> extract(@RequestBody Map<String, String> body) {
        String source = body.getOrDefault("text", "").trim();
        if (source.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "待提取文本不能为空");
        String city = source.contains("上海") ? "上海" : source.contains("南京") ? "南京" : "";
        String organization = source.contains("南京邮电大学") ? "南京邮电大学" : source.contains("东南大学") ? "东南大学" : "";
        String position = source.contains("教授") ? "教授" : source.contains("博士") ? "博士" : "";
        return Map.of("mode", "demo", "message", "当前为本地演示提取器，请在生产环境接入OCR与大模型服务", "data", Map.of("name", "", "organization", organization, "position", position, "city", city, "tags", List.of(), "sourceText", source));
    }

    private String reverseLabel(String type) {
        return switch (type) {
            case "指导" -> "导师";
            case "导师" -> "指导";
            case "学生" -> "指导";
            default -> type;
        };
    }
}
