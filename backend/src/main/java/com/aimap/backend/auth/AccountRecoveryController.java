package com.aimap.backend.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth/account-deletion-status")
public class AccountRecoveryController {
    private final WechatAuthService wechat;
    private final AccountSessions sessions;
    public AccountRecoveryController(WechatAuthService wechat, AccountSessions sessions) { this.wechat = wechat; this.sessions = sessions; }
    @PostMapping public Status status(@Valid @RequestBody Recovery request) {
        String owner = wechat.exchangeCode(request.code());
        return new Status(owner, sessions.deletionConfirmed(owner, request.operationId()));
    }
    public record Recovery(@NotBlank @Size(max=128) String code, @NotBlank @Pattern(regexp="[a-fA-F0-9-]{36}") String operationId) { }
    public record Status(String ownerId, boolean confirmed) { }
}
