package com.aimap.backend.config;

import com.aimap.backend.auth.*;
import com.aimap.backend.contact.*;
import com.aimap.backend.profile.*;
import com.aimap.backend.error.GlobalExceptionHandler;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.net.URI;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class EncodedRouteSecurityTests {
    private final TokenService tokens = new TokenService(new AuthProperties("test-only-routing-key",1));
    private final String authorization = "Bearer " + tokens.issue("owner");

    @ParameterizedTest
    @ValueSource(strings={"/api/%63ontacts", "/api/contacts;ignored=value"})
    void mvcRoutesEquivalentLegacyPathsButDisabledGuardBlocksThem(String path) throws Exception {
        var contacts = mock(ContactService.class);
        var enabledFilter = new ApiSecurityFilter(tokens,100,100,100,1,20,200,true);
        MockMvc enabled = MockMvcBuilders.standaloneSetup(new ContactController(contacts)).addFilters(enabledFilter).addInterceptors(new AuthInterceptor(tokens)).build();
        // Prove these are actual MVC aliases, rather than malformed paths rejected by routing.
        enabled.perform(post(URI.create(path)).header("Authorization",authorization).contentType("application/json").content("{\"name\":\"person\",\"tags\":[]}")).andExpect(status().isCreated());
        var disabledFilter = new ApiSecurityFilter(tokens,100,100,100,1,20,200,false);
        MockMvc disabled = MockMvcBuilders.standaloneSetup(new ContactController(contacts)).addFilters(disabledFilter).addInterceptors(new AuthInterceptor(tokens)).build();
        disabled.perform(post(URI.create(path)).header("Authorization",authorization).contentType("application/json").content("{\"name\":\"person\",\"tags\":[]}")).andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @ValueSource(strings={"/api/users/%69mportable/123AB456", "/api/users/importable;ignored=value/123AB456"})
    void mvcImportAliasesShareBudgetWithNormalImportPath(String path) throws Exception {
        var filter = new ApiSecurityFilter(tokens,100,100,100,1,20,200,false);
        var controller = new UserImportController(mock(UserProfileStore.class),mock(PublishedProfileService.class));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).addFilters(filter).addInterceptors(new AuthInterceptor(tokens)).build();
        mvc.perform(get(URI.create(path)).header("Authorization",authorization)).andExpect(status().isNotFound());
        mvc.perform(get("/api/users/importable/234CD567").header("Authorization",authorization)).andExpect(status().isTooManyRequests());
    }
}
