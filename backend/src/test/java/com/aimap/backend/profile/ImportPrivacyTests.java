package com.aimap.backend.profile;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ImportPrivacyTests {
    @Test void unpublishedAndUnknownCodeHaveIdenticalPublicResponse() {
        UserProfileStore profiles = mock(UserProfileStore.class);
        PublishedProfileService published = mock(PublishedProfileService.class);
        UserImportController controller = new UserImportController(profiles, published);
        UserProfile privateProfile = new UserProfileStore().ensure("private-owner");
        when(profiles.findByContactCode("234CD567")).thenReturn(privateProfile);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("currentOpenId", "requester");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        try {
            var missing = assertThrows(ResponseStatusException.class, () -> controller.importable("123AB456"));
            var hidden = assertThrows(ResponseStatusException.class, () -> controller.importable("234CD567"));
            assertEquals(missing.getStatusCode(), hidden.getStatusCode());
            assertEquals(missing.getReason(), hidden.getReason());
        } finally { RequestContextHolder.resetRequestAttributes(); }
    }
}
