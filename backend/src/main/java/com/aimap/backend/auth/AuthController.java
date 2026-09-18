package com.aimap.backend.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final WechatAuthService wechatAuthService;
    private final TokenService tokenService;
    public AuthController(WechatAuthService wechatAuthService, TokenService tokenService) { this.wechatAuthService = wechatAuthService; this.tokenService = tokenService; }

    @PostMapping("/wechat-login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest request) {
        String openId = wechatAuthService.exchangeCode(request.code());
        return Map.of("token", tokenService.issue(openId), "expiresIn", 604800);
    }

    public record LoginRequest(@NotBlank String code) { }
}
