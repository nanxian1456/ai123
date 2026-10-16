package com.aimap.backend.contact;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

@DataJpaTest
class ContactGeoFieldsTests {
    @Autowired private ContactRepository contactRepository;
    @Autowired private RelationshipRepository relationshipRepository;
    private ContactService contacts;

    @BeforeEach
    void setUp() {
        contacts = new ContactService(contactRepository, relationshipRepository, false);
    }

    @Test
    void persistsRegionAddressAndCoordinates() {
        Contact saved = contacts.save("owner-one", new ContactRequest(
                "张老师", "学校", "教授", "南京", "南京大学仙林校区", 32.12, 118.95, "江苏", "中国", "", "", "", List.of("高校", "合作")));

        ContactService reloadedService = new ContactService(contactRepository, relationshipRepository, false);
        Contact reloaded = reloadedService.findOne("owner-one", saved.id());
        assertEquals("中国", reloaded.country());
        assertEquals("江苏", reloaded.province());
        assertEquals("南京大学仙林校区", reloaded.address());
        assertEquals(32.12, reloaded.latitude());
        assertEquals(118.95, reloaded.longitude());
        assertEquals(List.of("高校", "合作"), reloaded.tags());

        Contact edited = contacts.update("owner-one", saved.id(), new ContactRequest(
                "张老师", "学校", "教授", "多伦多", "", null, null, "安大略省", "加拿大", "", "", "", List.of("合作")));
        assertEquals("加拿大", edited.country());
        assertEquals("多伦多", reloadedService.findOne("owner-one", saved.id()).city());

        assertNull(reloadedService.findOne("owner-two", saved.id()));
    }
}
