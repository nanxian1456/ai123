package com.aimap.backend.config;

import com.aimap.backend.auth.AuthProperties;
import com.aimap.backend.auth.TokenService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import static org.junit.jupiter.api.Assertions.*;

class ApiQuotaTests {
    private final TokenService tokens = new TokenService(new AuthProperties("test-secret-not-production", 1));
    private MockHttpServletResponse call(ApiSecurityFilter filter, String path, String auth) throws Exception {
        return call(filter, "POST", path, auth);
    }
    private MockHttpServletResponse call(ApiSecurityFilter filter, String method, String path, String auth) throws Exception {
        var request = new MockHttpServletRequest(method,path);
        request.setRequestURI(path); request.setRemoteAddr("127.0.0.1");
        request.addHeader("Authorization",auth);
        var response = new MockHttpServletResponse();
        filter.doFilter(request,response,new MockFilterChain()); return response;
    }
    @Test void dailyAiQuotaIsSharedAcrossValidTokensForAccount() throws Exception {
        var filter = new ApiSecurityFilter(tokens,100,100,100,100,1,10,false);
        assertEquals(200,call(filter,"/api/ai/extract","Bearer "+tokens.issue("owner")).getStatus());
        var refreshedTokens = new TokenService(new AuthProperties("test-secret-not-production", 2));
        var denied = call(filter,"/api/ai/extract","Bearer "+refreshedTokens.issue("owner"));
        assertEquals(429,denied.getStatus());
        assertTrue(denied.getContentAsString().contains("AI_DAILY_QUOTA_EXCEEDED"));
    }
    @Test void globalAiBudgetIsSharedAcrossAccountsButInvalidTokensDoNotSpendIt() throws Exception {
        var filter = new ApiSecurityFilter(tokens,100,100,100,100,10,1,false);
        call(filter,"/api/ai/extract","Bearer forged");
        assertEquals(200,call(filter,"/api/ai/extract","Bearer "+tokens.issue("first")).getStatus());
        assertEquals(429,call(filter,"/api/ai/extract","Bearer "+tokens.issue("second")).getStatus());
    }
    @Test void legacyWritesAreDisabledByDefaultAndExplicitlyOptIn() throws Exception {
        var disabled = new ApiSecurityFilter(tokens,100,100,100,100,10,10,false);
        assertEquals(403,call(disabled,"/api/contacts","Bearer "+tokens.issue("owner")).getStatus());
        assertEquals(403,call(disabled,"/api/relationships/4","Bearer "+tokens.issue("owner")).getStatus());
        var enabled = new ApiSecurityFilter(tokens,100,100,100,100,10,10,true);
        assertEquals(200,call(enabled,"/api/contacts","Bearer "+tokens.issue("owner")).getStatus());
    }
    @Test void deprecatedProfileWritesAreDisabledButPublicationAndReadsRemainActive() throws Exception {
        var filter = new ApiSecurityFilter(tokens,100,100,100,100,10,10,false);
        String auth = "Bearer " + tokens.issue("owner");
        assertEquals(403,call(filter,"PATCH","/api/me",auth).getStatus());
        assertEquals(403,call(filter,"PATCH","/api/me/visibility",auth).getStatus());
        assertEquals(403,call(filter,"POST","/api/me/avatar",auth).getStatus());
        assertEquals(200,call(filter,"PATCH","/api/me/published-profile",auth).getStatus());
        assertEquals(200,call(filter,"GET","/api/me",auth).getStatus());
        assertEquals(200,call(filter,"GET","/api/me/avatar/old.png",auth).getStatus());
        assertEquals(200,call(filter,"GET","/api/local-export",auth).getStatus());
    }
}
