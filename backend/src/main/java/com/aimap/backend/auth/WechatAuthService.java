package com.aimap.backend.auth;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
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

@Service
public class WechatAuthService {
    private static final Logger logger = LoggerFactory.getLogger(WechatAuthService.class);
    private final WechatProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public WechatAuthService(WechatProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public String exchangeCode(String code) {
        if (!properties.configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "微信登录尚未配置 AppID 和 Secret");
        try {
            String query = "appid=" + encode(properties.appId()) + "&secret=" + encode(properties.appSecret()) + "&js_code=" + encode(code) + "&grant_type=authorization_code";
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.weixin.qq.com/sns/jscode2session?" + query)).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                logger.warn("WeChat login provider returned HTTP {}", response.statusCode());
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "微信登录服务暂不可用");
            }
            JsonNode body = objectMapper.readTree(response.body());
            String openId = body.path("openid").asText("");
            if (openId.isBlank()) {
                logger.warn("WeChat login rejected code with errcode {}", body.path("errcode").asInt(-1));
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "微信登录凭证无效");
            }
            return openId;
        } catch (ResponseStatusException exception) { throw exception; }
        catch (Exception exception) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "微信登录服务暂不可用"); }
    }

    private String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
