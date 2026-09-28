package com.aimap.backend.profile;

import com.aimap.backend.auth.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.Pattern;

@RestController
@RequestMapping("/api/users")
@Validated
public class UserImportController {
    private final UserProfileStore profiles;
    private final PublishedProfileService publishedProfiles;

    public UserImportController(UserProfileStore profiles, PublishedProfileService publishedProfiles) {
        this.profiles = profiles;
        this.publishedProfiles = publishedProfiles;
    }

    @GetMapping("/importable/{contactCode}")
    public ImportableUserProfile importable(
            @PathVariable @Pattern(regexp = "\\d{3}[A-Za-z]{2}\\d{3}", message = "导入码格式无效") String contactCode
    ) {
        UserProfile profile = profiles.findByContactCode(contactCode.trim().toUpperCase());
        if (profile == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "未找到可导入的用户");
        if (profile.ownerId().equals(CurrentUser.openId())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不能导入自己");
        PublishedProfileEntity published = publishedProfiles.find(profile.ownerId());
        if (published == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "对方尚未公开导入资料");
        return new ImportableUserProfile(
                published.getNickname(), published.getOrganization(), published.getPosition(),
                published.getCity(), published.getBio()
        );
    }

    public record ImportableUserProfile(String nickname, String organization, String position, String city, String bio) { }
}
