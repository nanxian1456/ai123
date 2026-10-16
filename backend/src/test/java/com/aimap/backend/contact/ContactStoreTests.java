package com.aimap.backend.contact;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = {
        "auth.token-secret=test-only-token-secret-not-for-production",
        "spring.datasource.url=jdbc:h2:mem:contact_store_test;DB_CLOSE_DELAY=-1",
        "demo-data.enabled=false"
})
class ContactStoreTests {
    @Autowired ContactRepository contacts;
    @Autowired RelationshipRepository relationships;

    @Test
    void keepsContactsAndRelationshipsInDatabaseAndSeparatedByOwner() {
        ContactStore store = new ContactStore(contacts, relationships, false);
        ContactRequest request = new ContactRequest("张老师", "学校", "教授", "南京", "南京大学仙林校区", 32.12, 118.95, "江苏", "中国", "", "", "", List.of("高校", "合作"));
        Contact first = store.save("owner-one", request);
        Contact second = store.save("owner-one", new ContactRequest("王老师", "", "", "南京", "江苏", "中国", "", "", "", List.of()));
        Relationship relationship = store.saveRelationship("owner-one", new RelationshipRequest(first.id(), second.id(), "合作", "项目"));

        ContactStore anotherInstance = new ContactStore(contacts, relationships, false);
        assertEquals("中国", anotherInstance.findOne("owner-one", first.id()).country());
        assertEquals("江苏", anotherInstance.findOne("owner-one", first.id()).province());
        assertEquals("南京大学仙林校区", anotherInstance.findOne("owner-one", first.id()).address());
        assertEquals(32.12, anotherInstance.findOne("owner-one", first.id()).latitude());
        assertEquals(118.95, anotherInstance.findOne("owner-one", first.id()).longitude());
        assertEquals(List.of("高校", "合作"), anotherInstance.findOne("owner-one", first.id()).tags());
        assertEquals(1, anotherInstance.relationshipsFor("owner-one").size());
        assertEquals(relationship.id(), anotherInstance.relationshipsFor("owner-one").getFirst().id());
        assertTrue(anotherInstance.findAll("owner-two").isEmpty());
        assertNull(anotherInstance.findOne("owner-two", first.id()));
        assertFalse(anotherInstance.delete("owner-two", first.id()));
        assertFalse(anotherInstance.deleteRelationship("owner-two", relationship.id()));

        ContactRequest edited = new ContactRequest("张老师", "学校", "教授", "多伦多", "安大略省", "加拿大", "", "", "", List.of("合作"));
        assertEquals("加拿大", anotherInstance.update("owner-one", first.id(), edited).country());
        assertEquals("加拿大", store.findOne("owner-one", first.id()).country());
        assertEquals(List.of("合作"), store.findOne("owner-one", first.id()).tags());
        assertTrue(anotherInstance.delete("owner-one", first.id()));
        assertTrue(store.relationshipsFor("owner-one").isEmpty());
        assertEquals(1, store.findAll("owner-one").size());
    }
}
