package com.aimap.backend.profile;

import com.aimap.backend.auth.CurrentUser;
import com.aimap.backend.contact.Contact;
import com.aimap.backend.contact.ContactService;
import com.aimap.backend.contact.Relationship;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/local-export")
public class LegacyExportController {
    private final UserProfileStore profiles;
    private final ContactService contacts;

    public LegacyExportController(UserProfileStore profiles, ContactService contacts) {
        this.profiles = profiles;
        this.contacts = contacts;
    }

    @GetMapping
    public LegacyExport export() {
        String ownerId = CurrentUser.openId();
        return new LegacyExport(ownerId, profiles.findExisting(ownerId),
                contacts.findAll(ownerId), contacts.relationshipsFor(ownerId));
    }

    public record LegacyExport(String ownerId, UserProfile profile,
                               List<Contact> contacts, List<Relationship> relationships) { }
}
