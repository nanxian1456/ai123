package com.aimap.backend.contact;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/contacts")
public class ContactController {
    private final ContactStore store;

    public ContactController(ContactStore store) { this.store = store; }

    @GetMapping
    public List<Contact> list(@RequestHeader(value = "X-User-Id", defaultValue = "demo") String ownerId,
                              @RequestParam(defaultValue = "") String keyword,
                              @RequestParam(defaultValue = "") String city,
                              @RequestParam(defaultValue = "") String tag) {
        String lowerKeyword = keyword.toLowerCase(Locale.ROOT).trim();
        return store.findAll(ownerId).stream()
                .filter(c -> lowerKeyword.isBlank() || contains(c.name(), lowerKeyword) || contains(c.organization(), lowerKeyword) || contains(c.position(), lowerKeyword))
                .filter(c -> city.isBlank() || c.city().equals(city))
                .filter(c -> tag.isBlank() || c.tags().contains(tag))
                .toList();
    }

    @GetMapping("/{id}")
    public Contact detail(@RequestHeader(value = "X-User-Id", defaultValue = "demo") String ownerId, @PathVariable Long id) {
        Contact contact = store.findOne(ownerId, id);
        if (contact == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "联系人不存在");
        return contact;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Contact create(@RequestHeader(value = "X-User-Id", defaultValue = "demo") String ownerId, @Valid @RequestBody ContactRequest request) {
        return store.save(ownerId, request);
    }

    @PatchMapping("/{id}")
    public Contact update(@RequestHeader(value = "X-User-Id", defaultValue = "demo") String ownerId, @PathVariable Long id, @Valid @RequestBody ContactRequest request) {
        Contact contact = store.update(ownerId, id, request);
        if (contact == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "联系人不存在");
        return contact;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@RequestHeader(value = "X-User-Id", defaultValue = "demo") String ownerId, @PathVariable Long id) {
        if (!store.delete(ownerId, id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "联系人不存在");
    }

    private boolean contains(String value, String keyword) { return value.toLowerCase(Locale.ROOT).contains(keyword); }
}
