package com.aimap.backend.auth;

import com.aimap.backend.error.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;
import java.net.http.*;
import com.aimap.backend.error.GlobalExceptionHandler;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.MediaType;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WechatErrorTests {
    private WechatAuthService provider(String body) throws Exception {
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(body);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        return new WechatAuthService(new WechatProperties("app", "test-secret"), new ObjectMapper(), client);
    }
    @Test void invalidSecretIsAConfigurationProblem() throws Exception {
        ApiException error = assertThrows(ApiException.class, () -> provider("{\"errcode\":40125,\"errmsg\":\"invalid secret\"}").exchangeCode("code"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.status());
        assertEquals("WECHAT_CONFIG_INVALID", error.code());
        assertTrue(error.getMessage().contains("联系开发者"));
        assertFalse(error.getMessage().contains("test-secret"));
    }
    @Test void expiredCodeAsksForANewLogin() throws Exception {
        ApiException error = assertThrows(ApiException.class, () -> provider("{\"errcode\":40029}").exchangeCode("code"));
        assertEquals(HttpStatus.UNAUTHORIZED, error.status());
        assertEquals("WECHAT_CODE_INVALID", error.code());
        assertTrue(error.getMessage().contains("重新点击登录"));
    }
    @Test void unknownProviderFailureIsNotASessionError() throws Exception {
        ApiException error = assertThrows(ApiException.class, () -> provider("{\"errcode\":-1}").exchangeCode("code"));
        assertEquals(HttpStatus.BAD_GATEWAY, error.status());
        assertEquals("WECHAT_UNAVAILABLE", error.code());
    }
    @Test void providerTimeoutHasAnActionableError() throws Exception {
        HttpClient client = mock(HttpClient.class);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenThrow(new HttpTimeoutException("private provider URL"));
        var service = new WechatAuthService(new WechatProperties("app", "test-secret"), new ObjectMapper(), client);
        ApiException error = assertThrows(ApiException.class, () -> service.exchangeCode("code"));
        assertEquals(HttpStatus.GATEWAY_TIMEOUT, error.status());
        assertEquals("WECHAT_TIMEOUT", error.code());
        assertFalse(error.getMessage().contains("private"));
    }
    @Test void loginEndpointReturnsConfigurationReasonInThePublicErrorShape() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new AuthController(provider("{\"errcode\":40125}"), mock(TokenService.class)))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(post("/api/auth/wechat-login").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"test-code\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("WECHAT_CONFIG_INVALID"))
                .andExpect(jsonPath("$.message").value("微信登录配置有误，请联系开发者检查后端 AppID 与 AppSecret"));
    }
}
