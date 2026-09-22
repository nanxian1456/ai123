package com.aimap.backend.validation;

import com.aimap.backend.ai.AiExtractionRequest;
import com.aimap.backend.contact.ContactRequest;
import com.aimap.backend.contact.RelationshipRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;

class RequestValidationTests {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void rejectsInvalidContactFields() {
        ContactRequest request = new ContactRequest("", "", "", "", "", "abc", "not-an-email", "", List.of(""));
        assertFalse(validator.validate(request).isEmpty());
    }

    @Test
    void rejectsInvalidRelationshipIds() {
        assertFalse(validator.validate(new RelationshipRequest(0L, -1L, "", "")).isEmpty());
    }

    @Test
    void rejectsOversizedAiInput() {
        assertFalse(validator.validate(new AiExtractionRequest("x".repeat(4001))).isEmpty());
    }
}
