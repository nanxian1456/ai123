package com.aimap.backend.profile;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserProfileStoreTests {
    @Test
    void keepsProfilesSeparatedByOpenId() {
        UserProfileStore store = new UserProfileStore();
        store.update("wx-user-one", new UserProfileRequest("小王", "南京邮电大学", "学生", "南京", "测试资料"));

        assertTrue(store.ensure("wx-user-one").profileCompleted());
        assertEquals("小王", store.ensure("wx-user-one").nickname());
        assertFalse(store.ensure("wx-user-two").profileCompleted());
        assertEquals("", store.ensure("wx-user-two").nickname());
    }
}
