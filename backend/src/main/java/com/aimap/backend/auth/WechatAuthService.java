package com.aimap.backend.auth;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import com.aimap.backend.error.ApiException;
import java.net.http.HttpTimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class WechatAuthService {
    private static final Logger logger = LoggerFactory.getLogger(WechatAuthService.class);
    private final WechatProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public WechatAuthService(WechatProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(properties.connectTimeoutSeconds())).build());
    }

    public WechatAuthService(WechatProperties properties, ObjectMapper objectMapper, HttpClient httpClient) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    public String exchangeCode(String code) {
        if (!properties.configured()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "WECHAT_CONFIG_MISSING", "微信登录尚未配置，请联系开发者设置后端 AppID 与 AppSecret");
        try {
            String query = "appid=" + encode(properties.appId()) + "&secret=" + encode(properties.appSecret()) + "&js_code=" + encode(code) + "&grant_type=authorization_code";
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.weixin.qq.com/sns/jscode2session?" + query)).timeout(Duration.ofSeconds(properties.requestTimeoutSeconds())).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                logger.warn("WeChat login provider returned HTTP {}", response.statusCode());
                throw new ApiException(HttpStatus.BAD_GATEWAY, "WECHAT_UNAVAILABLE", "微信登录服务暂不可用，请稍后重新点击登录");
            }
            JsonNode body = objectMapper.readTree(response.body());
            String openId = body.path("openid").asText("");
            if (openId.isBlank()) {
                int errorCode = body.path("errcode").asInt(-1);
                logger.warn("WeChat login rejected code with errcode {}", errorCode);
                if (errorCode == 40125 || errorCode == 40013)
                    throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "WECHAT_CONFIG_INVALID", "微信登录配置有误，请联系开发者检查后端 AppID 与 AppSecret");
                if (errorCode == 40029 || errorCode == 40163)
                    throw new ApiException(HttpStatus.UNAUTHORIZED, "WECHAT_CODE_INVALID", "微信登录凭证已失效，请重新点击登录");
                if (errorCode == 45011)
                    throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "WECHAT_RATE_LIMITED", "微信登录过于频繁，请稍后重新点击登录");
                throw new ApiException(HttpStatus.BAD_GATEWAY, "WECHAT_UNAVAILABLE", "微信登录服务暂不可用，请稍后重新点击登录");
            }
            return openId;
        } catch (ApiException exception) { throw exception; }
        catch (HttpTimeoutException exception) { throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "WECHAT_TIMEOUT", "微信登录服务响应超时，请稍后重新点击登录"); }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new ApiException(HttpStatus.BAD_GATEWAY, "WECHAT_UNAVAILABLE", "微信登录已中断，请重新点击登录"); }
        catch (Exception exception) { throw new ApiException(HttpStatus.BAD_GATEWAY, "WECHAT_UNAVAILABLE", "无法连接微信登录服务，请稍后重新点击登录"); }
    }

    private String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
