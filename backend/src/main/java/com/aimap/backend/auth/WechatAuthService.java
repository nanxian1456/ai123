package com.aimap.backend.auth;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class WechatAuthService {
    private final WechatProperties properties;
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private static final Pattern OPEN_ID = Pattern.compile("\\\"openid\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");

    public WechatAuthService(WechatProperties properties) { this.properties = properties; }

    public String exchangeCode(String code) {
        if (!properties.configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "微信登录尚未配置 AppID 和 Secret");
        try {
            String query = "appid=" + encode(properties.appId()) + "&secret=" + encode(properties.appSecret()) + "&js_code=" + encode(code) + "&grant_type=authorization_code";
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.weixin.qq.com/sns/jscode2session?" + query)).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            Matcher matcher = OPEN_ID.matcher(response.body());
            if (!matcher.find() || matcher.group(1).isBlank()) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "微信登录凭证无效");
            String openId = matcher.group(1);
            return openId;
        } catch (ResponseStatusException exception) { throw exception; }
        catch (Exception exception) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "微信登录服务暂不可用"); }
    }

    private String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
