package com.aimap.backend.profile;

import com.aimap.backend.auth.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
public class ProfileController {
    private final UserProfileStore profiles;
    public ProfileController(UserProfileStore profiles) { this.profiles = profiles; }

    @GetMapping
    public UserProfile me() { return profiles.ensure(CurrentUser.openId()); }

    @PatchMapping
    public UserProfile update(@Valid @RequestBody UserProfileRequest request) { return profiles.update(CurrentUser.openId(), request); }
}
