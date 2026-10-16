package com.aimap.backend.profile;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class PublishedProfileServiceTests {
    @Autowired UserProfileStore profiles;
    @Autowired PublishedProfileService published;

    @Test
    void existingProfilesStayPrivateUntilExplicitPublicationAndCanBeRevoked() {
        String owner = "publication-test-owner";
        String code = profiles.ensure(owner).contactCode();
        assertTrue(code.matches("\\d{3}[A-Z]{2}\\d{3}"));
        assertEquals(code, profiles.ensure(owner).contactCode());
        assertNull(published.find(owner));

        published.publish(owner, new PublishedProfileRequest(true, "小王", "大学", "", "南京", ""));
        assertEquals("小王", published.find(owner).getNickname());
        assertEquals("大学", published.find(owner).getOrganization());
        published.publish(owner, new PublishedProfileRequest(false, "", "", "", "", ""));
        assertNull(published.find(owner));
    }
}
