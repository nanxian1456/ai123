package com.aimap.backend.profile;

import com.aimap.backend.auth.CurrentUser;
import com.aimap.backend.auth.WechatAuthService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/me/account")
public class AccountDeletionController {
    private final AccountDeletionService accounts;
    private final WechatAuthService wechat;
    public AccountDeletionController(AccountDeletionService accounts, WechatAuthService wechat) { this.accounts = accounts; this.wechat = wechat; }
    @DeleteMapping
    public Result delete(@Valid @RequestBody DeletionRequest request) {
        String owner = CurrentUser.openId();
        if (!owner.equals(wechat.exchangeCode(request.code()))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "微信身份已变化，请重新登录后再注销");
        accounts.delete(owner, request.operationId() == null ? java.util.UUID.randomUUID().toString() : request.operationId());
        return new Result("deleted", owner);
    }
    public record DeletionRequest(@NotBlank @Size(max=128) String code, @NotBlank @Pattern(regexp="注销") String confirmation, @Pattern(regexp="[a-fA-F0-9-]{36}") String operationId) { }
    public record Result(String status, String ownerId) { }
}
