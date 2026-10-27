package com.aimap.backend.profile;

import com.aimap.backend.auth.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;

@RestController
@RequestMapping("/api/me")
public class AccountSettingsController {
    private final WechatAuthService wechat;
    private final AccountSessions sessions;
    private final UserProfileStore profiles;
    private final PublishedProfileService published;
    public AccountSettingsController(WechatAuthService wechat, AccountSessions sessions, UserProfileStore profiles, PublishedProfileService published) {
        this.wechat = wechat; this.sessions = sessions; this.profiles = profiles; this.published = published;
    }
    private String verify(String code) {
        String owner = CurrentUser.openId();
        if (!owner.equals(wechat.exchangeCode(code))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "微信身份已变化，请重新登录后再操作");
        return owner;
    }
    @PostMapping("/sessions/revoke") public Map<String,String> revoke(@Valid @RequestBody Revoke request) {
        String owner = verify(request.code()); sessions.revokeAll(owner); return Map.of("status", "revoked", "ownerId", owner);
    }
    @PostMapping("/import-code/reset") public Map<String,String> reset(@Valid @RequestBody Reset request) {
        return Map.of("contactCode", profiles.resetImportCode(verify(request.code())));
    }
    @GetMapping("/published-profile") public Preview preview() {
        PublishedProfileEntity value = published.find(CurrentUser.openId());
        return value == null ? new Preview(false, "", "", "", "", "") :
            new Preview(true, value.getNickname(), value.getOrganization(), value.getPosition(), value.getCity(), value.getBio());
    }
    public record Revoke(@NotBlank @Size(max=128) String code, @NotBlank @Pattern(regexp="退出全部") String confirmation) { }
    public record Reset(@NotBlank @Size(max=128) String code, @NotBlank @Pattern(regexp="重置") String confirmation) { }
    public record Preview(boolean published, String nickname, String organization, String position, String city, String bio) { }
}
