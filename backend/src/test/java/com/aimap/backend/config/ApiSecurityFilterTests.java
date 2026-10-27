package com.aimap.backend.config;

import com.aimap.backend.auth.AuthProperties;
import com.aimap.backend.auth.TokenService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;

class ApiSecurityFilterTests {
    private MockHttpServletResponse execute(ApiSecurityFilter filter, String method, String path, String auth, String ip) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setRequestURI(path);
        if (auth != null) request.addHeader("Authorization", auth);
        request.addHeader("X-Forwarded-For", "192.0.2." + Math.abs(auth == null ? 1 : auth.hashCode()));
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
    @Test void randomAuthorizationCannotBypassLoginBudget() throws Exception {
        ApiSecurityFilter filter = new ApiSecurityFilter(1, 1, 1, 1);
        for (int i = 0; i < 10; i++) assertEquals(200, execute(filter,"POST","/api/auth/wechat-login","Bearer random-"+i,"127.0.0.1").getStatus());
        assertEquals(429, execute(filter,"POST","/api/auth/wechat-login","Bearer another","127.0.0.1").getStatus());
    }
    @Test void importCodesShareBudgetAndInvalidTokensUseRemoteAddress() throws Exception {
        ApiSecurityFilter filter = new ApiSecurityFilter(1, 1, 1, 1);
        assertEquals(200, execute(filter,"GET","/api/users/importable/123AB456","Bearer invalid-a","127.0.0.1").getStatus());
        assertEquals(429, execute(filter,"GET","/api/users/importable/234CD567","Bearer invalid-b","127.0.0.1").getStatus());
    }
    @Test void resourceIdsShareReadBudget() throws Exception {
        ApiSecurityFilter filter = new ApiSecurityFilter(1, 1, 1, 1);
        assertEquals(200, execute(filter,"GET","/api/contacts/1",null,"127.0.0.1").getStatus());
        assertEquals(429, execute(filter,"GET","/api/contacts/2",null,"127.0.0.1").getStatus());
    }
    @Test void largeRandomAuthorizationSetDoesNotLockNewClient() throws Exception {
        ApiSecurityFilter filter = new ApiSecurityFilter(1, 1, 1, 1);
        for (int i = 0; i < 10001; i++) execute(filter,"GET","/api/contacts","Bearer random-"+i,"127.0.0.1");
        assertEquals(200, execute(filter,"GET","/api/contacts",null,"192.0.2.12").getStatus());
    }
    @Test void recoveryAndLoginShareTheSameAnonymousWechatBudget() throws Exception {
        ApiSecurityFilter filter = new ApiSecurityFilter(100, 100, 100, 100);
        for (int i=0; i<10; i++) assertEquals(200, execute(filter,"POST","/api/auth/account-deletion-status",null,"192.0.2.20").getStatus());
        assertEquals(429, execute(filter,"POST","/api/auth/wechat-login",null,"192.0.2.20").getStatus());
    }
}
