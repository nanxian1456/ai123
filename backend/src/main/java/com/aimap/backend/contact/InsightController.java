package com.aimap.backend.contact;

import com.aimap.backend.ai.AiExtractionRequest;
import com.aimap.backend.ai.AiExtractionResponse;
import com.aimap.backend.ai.AiExtractionService;
import com.aimap.backend.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@Validated
public class InsightController {
    private final ContactService contacts;
    private final InsightService insights;
    private final AiExtractionService aiExtraction;
    private final MapGeocoder geocoder;

    public InsightController(ContactService contacts, InsightService insights, AiExtractionService aiExtraction, MapGeocoder geocoder) {
        this.contacts = contacts;
        this.insights = insights;
        this.aiExtraction = aiExtraction;
        this.geocoder = geocoder;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() { return insights.dashboard(CurrentUser.openId()); }

    @GetMapping("/maps/cities")
    public List<Map<String, Object>> cities() { return insights.cities(CurrentUser.openId()); }

    @GetMapping("/tags")
    public List<Map<String, Object>> tags() { return insights.tags(CurrentUser.openId()); }

    @GetMapping("/organizations")
    public List<Map<String, Object>> organizations() { return insights.organizations(CurrentUser.openId()); }

    @GetMapping("/contacts/{id}/relationships")
    public List<Map<String, Object>> contactRelationships(@PathVariable @Positive Long id) {
        return insights.contactRelationships(CurrentUser.openId(), id);
    }

    @GetMapping("/graphs/contacts/{id}")
    public Map<String, Object> graph(@PathVariable @Positive Long id) {
        return insights.graph(CurrentUser.openId(), id);
    }

    @PostMapping("/relationships")
    @ResponseStatus(HttpStatus.CREATED)
    public Relationship createRelationship(@Valid @RequestBody RelationshipRequest request) {
        return contacts.saveRelationship(CurrentUser.openId(), request);
    }

    @DeleteMapping("/relationships/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRelationship(@PathVariable @Positive Long id) {
        contacts.deleteRelationship(CurrentUser.openId(), id);
    }

    @PostMapping("/ai/extract")
    public AiExtractionResponse extract(@Valid @RequestBody AiExtractionRequest request) {
        return aiExtraction.extract(request.text().trim());
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
        for (Contact contact : contacts.findAll(CurrentUser.openId())) {
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

    public record LocalLocationRequest(
            @NotBlank @Pattern(regexp = "province|city") String level,
            @NotBlank @Size(max = 50) String country,
            @Size(max = 50) String province,
            @Size(max = 50) String city,
            @NotNull @Size(max = 30) List<@NotBlank @Size(max = 50) String> regions) { }

    // The phone supplies region names only. Counts and contact membership stay on the phone.
    @PostMapping("/maps/locations")
    public Map<String, Object> localLocations(@Valid @RequestBody LocalLocationRequest request) {
        String country = request.country().trim();
        String province = request.province() == null ? "" : request.province().trim();
        String city = request.city() == null ? "" : request.city().trim();
        if (request.level().equals("city") && province.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "当前地区未设置，无法定位");
        }
        String prefix = country + (province.isBlank() ? "" : " " + province);
        MapGeocoder.Location center = MapLocationCatalog.locate(country, province, city);
        if (center == null) center = geocoder.locate(city.isBlank() ? prefix : prefix + " " + city);
        List<Map<String, Object>> markers = new ArrayList<>();
        if (city.isBlank()) {
            for (String name : request.regions().stream().map(String::trim).distinct().toList()) {
                try {
                    MapGeocoder.Location point = request.level().equals("province")
                            ? MapLocationCatalog.locateProvince(country, name)
                            : MapLocationCatalog.locateCity(country, province, name);
                    if (point == null) point = geocoder.locate(prefix + " " + name);
                    markers.add(Map.of("name", name, "latitude", point.latitude(), "longitude", point.longitude()));
                } catch (ResponseStatusException ignored) {
                    // An unavailable coordinate must not suppress the other local regions.
                }
            }
        }
        return Map.of("center", center, "markers", markers);
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
}
