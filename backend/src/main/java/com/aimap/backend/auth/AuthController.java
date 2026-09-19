package com.aimap.backend.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.Valid;
import com.aimap.backend.profile.UserProfile;
import com.aimap.backend.profile.UserProfileStore;
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
    private final UserProfileStore profiles;
    public AuthController(WechatAuthService wechatAuthService, TokenService tokenService, UserProfileStore profiles) { this.wechatAuthService = wechatAuthService; this.tokenService = tokenService; this.profiles = profiles; }

    @PostMapping("/wechat-login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest request) {
        String openId = wechatAuthService.exchangeCode(request.code());
        UserProfile profile = profiles.ensure(openId);
        return Map.of("token", tokenService.issue(openId), "expiresIn", 604800, "profileCompleted", profile.profileCompleted());
    }

    public record LoginRequest(@NotBlank String code) { }
}
