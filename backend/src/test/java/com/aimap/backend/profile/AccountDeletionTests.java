package com.aimap.backend.profile;

import com.aimap.backend.auth.*;
import com.aimap.backend.contact.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "auth.token-ttl-hours=1")
class AccountDeletionTests {
    @Autowired WebApplicationContext context;
    @Autowired UserProfileStore profiles;
    @Autowired UserProfileRepository profileRepository;
    @Autowired PublishedProfileService published;
    @Autowired ContactService contacts;
    @Autowired TokenService tokens;
    @Autowired InsightService insights;
    @MockitoBean WechatAuthService wechat;
    MockMvc mvc;
    String owner, other, token, otherToken;
    @BeforeEach void prepare() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = "delete-" + UUID.randomUUID(); other = "keep-" + UUID.randomUUID();
        profiles.ensure(owner); profiles.ensure(other);
        Contact first = contacts.save(owner, new ContactRequest("虚构资料", "", "", "", "", "", "", "", java.util.List.of("测试")));
        Contact second = contacts.save(owner, new ContactRequest("虚构关联资料", "", "", "", "", "", "", "", java.util.List.of()));
        contacts.saveRelationship(owner, new RelationshipRequest(first.id(), second.id(), "测试关系", ""));
        contacts.save(other, new ContactRequest("保留资料", "", "", "", "", "", "", "", java.util.List.of()));
        published.publish(owner, new PublishedProfileRequest(true, "虚构公开资料", "", "", "", ""));
        token = tokens.issue(owner); otherToken = tokens.issue(other);
        when(wechat.exchangeCode("fresh-delete-code")).thenReturn(owner);
    }
    @Test void confirmedDeletionRemovesOnlyThisOwnerAndInvalidatesOldTokens() throws Exception {
        assertEquals(2L, ((Number) insights.dashboard(owner).get("contactCount")).longValue());
        mvc.perform(delete("/api/me/account").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"confirmation\":\"注销\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("deleted"));
        assertFalse(profileRepository.existsById(owner));
        assertNull(published.find(owner)); assertTrue(contacts.findAll(owner).isEmpty()); assertTrue(contacts.relationshipsFor(owner).isEmpty());
        assertEquals(0L, ((Number) insights.dashboard(owner).get("contactCount")).longValue());
        assertTrue(profileRepository.existsById(other)); assertEquals(1, contacts.findAll(other).size());
        assertNull(tokens.verify(token)); assertEquals(other, tokens.verify(otherToken));
        mvc.perform(delete("/api/me/account").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"confirmation\":\"注销\"}"))
                .andExpect(status().isUnauthorized());
        assertEquals(owner, tokens.verify(tokens.issue(owner)), "a later genuine login can start a new account");
    }
    @Test void deletesTheCurrentServerAvatarFileAfterTheDatabaseCommit() throws Exception {
        java.nio.file.Path directory = java.nio.file.Path.of(System.getProperty("java.io.tmpdir"), "ai-network-map-test-avatars").toAbsolutePath().normalize();
        java.nio.file.Files.createDirectories(directory);
        String filename = UUID.randomUUID() + ".jpg";
        java.nio.file.Path avatar = directory.resolve(filename);
        java.nio.file.Files.writeString(avatar, "fixture image bytes");
        profiles.updateAvatar(owner, "http://127.0.0.1:8080/api/me/avatar/" + filename);
        try {
            mvc.perform(delete("/api/me/account").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"code\":\"fresh-delete-code\",\"confirmation\":\"注销\"}"))
                    .andExpect(status().isOk());
            assertFalse(java.nio.file.Files.exists(avatar), "the current referenced avatar must be cleaned after deletion");
        } finally { java.nio.file.Files.deleteIfExists(avatar); }
    }
    @Test void wrongWechatIdentityCannotDeleteTheAuthenticatedAccount() throws Exception {
        when(wechat.exchangeCode("wrong-owner-code")).thenReturn(other);
        mvc.perform(delete("/api/me/account").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"wrong-owner-code\",\"confirmation\":\"注销\"}"))
                .andExpect(status().isForbidden());
        assertTrue(profileRepository.existsById(owner)); assertEquals(owner, tokens.verify(token));
    }
    @Test void missingConfirmationDoesNotDeleteAnything() throws Exception {
        mvc.perform(delete("/api/me/account").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"confirmation\":\"\"}"))
                .andExpect(status().isBadRequest());
        assertTrue(profileRepository.existsById(owner));
    }

    @Test void deletionReceiptCanBeRecoveredWithoutAStillValidToken() throws Exception {
        String operation = "7e3004fa-9036-4e9b-9196-9083ac4a2399";
        mvc.perform(delete("/api/me/account").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"confirmation\":\"注销\",\"operationId\":\"" + operation + "\"}"))
                .andExpect(status().isOk());
        assertNull(tokens.verify(token));
        mvc.perform(post("/api/auth/account-deletion-status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"operationId\":\"" + operation + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.confirmed").value(true)).andExpect(jsonPath("$.ownerId").value(owner));
        mvc.perform(post("/api/auth/account-deletion-status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"operationId\":\"77f26a56-9fd6-40c7-8dd9-abcc625c21bc\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.confirmed").value(false));
    }
    @Test void revokingAllSessionsKeepsAccountDataAndOtherOwnersSessions() throws Exception {
        mvc.perform(post("/api/me/sessions/revoke").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"confirmation\":\"退出全部\"}"))
                .andExpect(status().isOk());
        assertNull(tokens.verify(token)); assertEquals(other, tokens.verify(otherToken));
        assertTrue(profileRepository.existsById(owner)); assertNotNull(published.find(owner));
    }
    @Test void resetImportCodeInvalidatesTheOldCachedCodeAndKeepsPublicFields() throws Exception {
        String old = profiles.ensure(owner).contactCode(); assertNotNull(profiles.findByContactCode(old));
        mvc.perform(post("/api/me/import-code/reset").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"confirmation\":\"重置\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.contactCode").isNotEmpty());
        String next = profiles.findExisting(owner).contactCode();
        assertNotEquals(old, next); assertNull(profiles.findByContactCode(old)); assertEquals(owner,profiles.findByContactCode(next).ownerId());
        assertNotNull(published.find(owner));
    }
    @Test void ownerPreviewReturnsOnlyTheActualPublishedFields() throws Exception {
        mvc.perform(get("/api/me/published-profile").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.published").value(true))
                .andExpect(jsonPath("$.nickname").value("虚构公开资料")).andExpect(jsonPath("$.ownerId").doesNotExist())
                .andExpect(jsonPath("$.phone").doesNotExist()).andExpect(jsonPath("$.avatarUrl").doesNotExist());
    }
    @Test void aLaterDeletionDoesNotLoseAnEarlierDevicesRecoveryReceipt() throws Exception {
        String first = "7e3004fa-9036-4e9b-9196-9083ac4a2399", second = "77f26a56-9fd6-40c7-8dd9-abcc625c21bc";
        mvc.perform(delete("/api/me/account").header("Authorization","Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"confirmation\":\"注销\",\"operationId\":\"" + first + "\"}"))
                .andExpect(status().isOk());
        profiles.ensure(owner);
        mvc.perform(delete("/api/me/account").header("Authorization","Bearer " + tokens.issue(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"confirmation\":\"注销\",\"operationId\":\"" + second + "\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/account-deletion-status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"fresh-delete-code\",\"operationId\":\"" + first + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.confirmed").value(true));
    }
}
