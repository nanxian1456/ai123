package com.aimap.backend.contact;

import com.aimap.backend.error.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

@DataJpaTest
class ContactServiceTests {
    @Autowired private ContactRepository contactRepository;
    @Autowired private RelationshipRepository relationshipRepository;
    private ContactService contacts;

    @BeforeEach
    void setUp() {
        contacts = new ContactService(contactRepository, relationshipRepository, false);
    }

    @Test
    void persistsContactsAndKeepsOwnersSeparated() {
        Contact saved = contacts.save("owner-one", request("王老师", "南京", "wang@example.com"));

        ContactService reloadedService = new ContactService(contactRepository, relationshipRepository, false);
        assertEquals("王老师", reloadedService.findOne("owner-one", saved.id()).name());
        assertNull(reloadedService.findOne("owner-two", saved.id()));
    }

    @Test
    void deletesRelationshipsTogetherWithAContact() {
        Contact first = contacts.save("owner-one", request("甲", "南京", ""));
        Contact second = contacts.save("owner-one", request("乙", "上海", ""));
        Relationship relationship = contacts.saveRelationship("owner-one", new RelationshipRequest(first.id(), second.id(), "合作", "项目"));
        assertNotNull(relationship.id());

        contacts.delete("owner-one", first.id());

        assertEquals(0, contacts.relationshipsFor("owner-one").size());
        assertThrows(ApiException.class, () -> contacts.delete("owner-one", first.id()));
    }

    @Test
    void returnsValidatedPageBoundaries() {
        contacts.save("owner-one", request("甲", "南京", ""));
        contacts.save("owner-one", request("乙", "上海", ""));

        PagedResponse<Contact> firstPage = contacts.search("owner-one", "", "", "", 0, 1);
        assertEquals(1, firstPage.items().size());
        assertEquals(2, firstPage.totalElements());
        assertEquals(2, firstPage.totalPages());
    }

    private ContactRequest request(String name, String city, String email) {
        return new ContactRequest(name, "测试单位", "成员", city, "", "13800000000", email, "", List.of("测试"));
    }
}
