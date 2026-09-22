package com.aimap.backend.contact;

import com.aimap.backend.auth.CurrentUser;
import com.aimap.backend.error.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.validation.annotation.Validated;

import java.util.List;
import java.util.Locale;
import java.text.Collator;
import java.util.Comparator;

@RestController
@RequestMapping("/api/contacts")
@Validated
public class ContactController {
    private final ContactService contacts;

    public ContactController(ContactService contacts) { this.contacts = contacts; }

    @GetMapping
    public List<Contact> list(@RequestParam(defaultValue = "") @Size(max = 100) String keyword,
                              @RequestParam(defaultValue = "") @Size(max = 50) String city,
                              @RequestParam(defaultValue = "") @Size(max = 20) String tag) {
        String ownerId = CurrentUser.openId();
        String lowerKeyword = keyword.toLowerCase(Locale.ROOT).trim();
        return contacts.findAll(ownerId).stream()
                .filter(c -> lowerKeyword.isBlank() || contains(c.name(), lowerKeyword) || contains(c.organization(), lowerKeyword) || contains(c.position(), lowerKeyword))
                .filter(c -> city.isBlank() || c.city().equals(city))
                .filter(c -> tag.isBlank() || c.tags().contains(tag))
                .toList();
    }

    @GetMapping("/page")
    public PagedResponse<Contact> page(
            @RequestParam(defaultValue = "") @Size(max = 100) String keyword,
            @RequestParam(defaultValue = "") @Size(max = 50) String city,
            @RequestParam(defaultValue = "") @Size(max = 20) String tag,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        return contacts.search(CurrentUser.openId(), keyword, city, tag, page, size);
    }

    @GetMapping("/directory")
    public List<ContactDirectoryItem> directory(@RequestParam(defaultValue = "") @Size(max = 100) String keyword,
                                                 @RequestParam(defaultValue = "") @Size(max = 50) String city,
                                                 @RequestParam(defaultValue = "") @Size(max = 20) String tag) {
        String ownerId = CurrentUser.openId();
        String lowerKeyword = keyword.toLowerCase(Locale.ROOT).trim();
        Collator collator = Collator.getInstance(Locale.CHINA);
        return contacts.findAll(ownerId).stream()
                .filter(c -> lowerKeyword.isBlank() || contains(c.name(), lowerKeyword) || contains(c.organization(), lowerKeyword) || contains(c.position(), lowerKeyword))
                .filter(c -> city.isBlank() || c.city().equals(city))
                .filter(c -> tag.isBlank() || c.tags().contains(tag))
                .map(contact -> ContactDirectoryItem.from(contact, PinyinInitial.of(contact.name())))
                .sorted(Comparator.comparing(ContactDirectoryItem::initial).thenComparing(ContactDirectoryItem::name, collator))
                .toList();
    }

    @GetMapping("/{id}")
    public Contact detail(@PathVariable @Positive Long id) {
        String ownerId = CurrentUser.openId();
        Contact contact = contacts.findOne(ownerId, id);
        if (contact == null) throw new ApiException(HttpStatus.NOT_FOUND, "CONTACT_NOT_FOUND", "联系人不存在");
        return contact;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Contact create(@Valid @RequestBody ContactRequest request) {
        return contacts.save(CurrentUser.openId(), request);
    }

    @PatchMapping("/{id}")
    public Contact update(@PathVariable @Positive Long id, @Valid @RequestBody ContactRequest request) {
        return contacts.update(CurrentUser.openId(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable @Positive Long id) {
        contacts.delete(CurrentUser.openId(), id);
    }

    private boolean contains(String value, String keyword) { return value.toLowerCase(Locale.ROOT).contains(keyword); }
}
