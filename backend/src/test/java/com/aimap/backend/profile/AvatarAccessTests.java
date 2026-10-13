package com.aimap.backend.profile;

import com.aimap.backend.auth.AuthInterceptor;
import com.aimap.backend.auth.AuthProperties;
import com.aimap.backend.auth.TokenService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AvatarAccessTests {
    @TempDir Path directory;
    @Test void publicBasePathPrefixPreservesOwnerDownload() throws Exception {
        var profiles = new UserProfileStore();
        profiles.updateAvatar("owner","https://example.test/aimap/uploads/avatars/old.png");
        Files.write(directory.resolve("old.png"),new byte[]{1,2,3});
        var tokens = new TokenService(new AuthProperties("test-only-avatar-key",1));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new AvatarController(profiles,directory.toString())).addInterceptors(new AuthInterceptor(tokens)).build();
        mvc.perform(get("/uploads/avatars/old.png").header("Authorization","Bearer "+tokens.issue("owner"))).andExpect(status().isOk());
        profiles.updateAvatar("owner","https://example.test/aimap/api/me/avatar/old.png");
        mvc.perform(get("/api/me/avatar/old.png").header("Authorization","Bearer "+tokens.issue("owner"))).andExpect(status().isOk());
        profiles.updateAvatar("owner","https://example.test/aimap/api/me/avatar/other.png");
        mvc.perform(get("/api/me/avatar/old.png").header("Authorization","Bearer "+tokens.issue("owner"))).andExpect(status().isNotFound());
    }
    @Test void legacyAvatarRequiresLoginAndOwnership() throws Exception {
        var profiles = new UserProfileStore();
        profiles.updateAvatar("owner","https://example.test/uploads/avatars/old.png");
        Files.write(directory.resolve("old.png"),new byte[]{1,2,3});
        var tokens = new TokenService(new AuthProperties("test-only-avatar-key",1));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new AvatarController(profiles,directory.toString())).addInterceptors(new AuthInterceptor(tokens)).build();
        mvc.perform(get("/uploads/avatars/old.png")).andExpect(status().isUnauthorized());
        mvc.perform(get("/uploads/avatars/old.png").header("Authorization","Bearer "+tokens.issue("other"))).andExpect(status().isNotFound());
        mvc.perform(get("/uploads/avatars/old.png").header("Authorization","Bearer "+tokens.issue("owner"))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","private, no-store")).andExpect(content().bytes(new byte[]{1,2,3}));
        mvc.perform(get("/api/me/avatar/old.png").header("Authorization","Bearer "+tokens.issue("owner"))).andExpect(status().isOk());
        mvc.perform(get("/api/me/avatar/secret.txt").header("Authorization","Bearer "+tokens.issue("owner"))).andExpect(status().isNotFound());
    }
}
