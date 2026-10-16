package com.aimap.backend.profile;

import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProfileHardeningTests {
    @Test void readingCompleteExistingProfileDoesNotWrite() {
        UserProfileRepository repository = mock(UserProfileRepository.class);
        UserProfileEntity entity = new UserProfileEntity("owner");
        entity.setContactCode("123AB456");
        when(repository.findById("owner")).thenReturn(Optional.of(entity));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        assertEquals("123AB456", new UserProfileStore(repository).ensure("owner").contactCode());
        verify(repository, never()).save(any());
    }
    @Test void publishedFieldLimitsMatchPrivateProfile() {
        try (var factory = jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertFalse(validator.validate(new PublishedProfileRequest(true,"name","x".repeat(61),"","","")).isEmpty());
            assertFalse(validator.validate(new PublishedProfileRequest(true,"name","","x".repeat(41),"","")).isEmpty());
            assertFalse(validator.validate(new PublishedProfileRequest(true,"name","","","x".repeat(31),"")).isEmpty());
            assertFalse(validator.validate(new PublishedProfileRequest(true,"name","","","","x".repeat(201))).isEmpty());
        }
    }
}
