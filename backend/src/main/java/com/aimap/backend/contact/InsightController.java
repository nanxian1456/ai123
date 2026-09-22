package com.aimap.backend.contact;

import com.aimap.backend.ai.AiExtractionRequest;
import com.aimap.backend.ai.AiExtractionResponse;
import com.aimap.backend.ai.AiExtractionService;
import com.aimap.backend.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@Validated
public class InsightController {
    private final ContactService contacts;
    private final InsightService insights;
    private final AiExtractionService aiExtraction;

    public InsightController(ContactService contacts, InsightService insights, AiExtractionService aiExtraction) {
        this.contacts = contacts;
        this.insights = insights;
        this.aiExtraction = aiExtraction;
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
}
