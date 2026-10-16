package com.aimap.backend.contact;

import com.aimap.backend.auth.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@RestController
@RequestMapping("/api")
public class InsightController {
    private final ContactStore store;
    private final MapGeocoder geocoder;
    public InsightController(ContactStore store, MapGeocoder geocoder) { this.store = store; this.geocoder = geocoder; }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode())
                .body(Map.of("detail", Objects.requireNonNullElse(exception.getReason(), "请求失败")));
    }

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

    @GetMapping("/maps/regions")
    public List<Map<String, Object>> regions(@RequestParam(defaultValue = "country") String level,
                                             @RequestParam(defaultValue = "") String country,
                                             @RequestParam(defaultValue = "") String province,
                                             @RequestParam(defaultValue = "false") boolean sample) {
        if (!List.of("country", "province", "city").contains(level)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "无效的地区层级");
        }
        Map<String, Long> counts = new HashMap<>();
        Map<String, List<Contact>> samples = new HashMap<>();
        for (Contact contact : store.findAll(CurrentUser.openId())) {
            if (!level.equals("country") && !contact.country().equals(country)) continue;
            if (level.equals("city") && !contact.province().equals(province)) continue;
            String name = switch (level) {
                case "country" -> contact.country();
                case "province" -> contact.province();
                default -> contact.city();
            };
            counts.merge(name, 1L, Long::sum);
            if (sample) {
                samples.computeIfAbsent(name, key -> new ArrayList<>()).add(contact);
            }
        }
        return counts.entrySet().stream()
                .sorted(Comparator.<Map.Entry<String, Long>>comparingLong(Map.Entry::getValue).reversed()
                        .thenComparing(Map.Entry::getKey))
                .map(entry -> {
                    if (!sample) {
                        return Map.<String, Object>of("name", entry.getKey(), "count", entry.getValue());
                    }
                    List<Map<String, Object>> sampleList = samples.getOrDefault(entry.getKey(), List.of()).stream()
                            .limit(3)
                            .map(contact -> Map.<String, Object>of(
                                    "id", contact.id(),
                                    "name", contact.name(),
                                    "initial", PinyinInitial.of(contact.name())))
                            .toList();
                    return Map.<String, Object>of("name", entry.getKey(), "count", entry.getValue(), "sample", sampleList);
                })
                .toList();
    }

    @GetMapping("/maps/locations")
    public Map<String, Object> locations(@RequestParam String level,
                                         @RequestParam(defaultValue = "") String country,
                                         @RequestParam(defaultValue = "") String province,
                                         @RequestParam(defaultValue = "") String city) {
        if (!List.of("province", "city").contains(level)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "无效的地区层级");
        }
        if (country.isBlank() || level.equals("city") && province.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "当前地区未设置，无法定位");
        }
        String prefix = country + (province.isBlank() ? "" : " " + province);
        MapGeocoder.Location center = MapLocationCatalog.locate(country, province, city);
        if (center == null) center = geocoder.locate(city.isBlank() ? prefix : prefix + " " + city);
        List<Map<String, Object>> markers = new ArrayList<>();
        if (!city.isBlank()) return Map.of("center", center, "markers", markers);
        // Bound external API usage for accounts with many distinct cities.
        for (Map<String, Object> region : regions(level, country, province, false).stream().limit(30).toList()) {
            String name = (String) region.get("name");
            if (name.isBlank()) continue;
            try {
                MapGeocoder.Location point = level.equals("province")
                        ? MapLocationCatalog.locateProvince(country, name)
                        : MapLocationCatalog.locateCity(country, province, name);
                if (point == null) point = geocoder.locate(prefix + " " + name);
                markers.add(Map.of("name", name, "count", region.get("count"),
                        "latitude", point.latitude(), "longitude", point.longitude()));
            } catch (ResponseStatusException ignored) {
                // One unresolved place must not hide the other markers.
            }
        }
        return Map.of("center", center, "markers", markers);
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
