package com.aimap.backend.profile;

import com.aimap.backend.auth.CurrentUser;
import com.aimap.backend.error.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

/**
 * Serves avatars uploaded before the mini program moved to local storage, so the one-time
 * migration can still copy them to the phone. Only the signed-in owner of an avatar can read
 * it; everyone else (including requests without a token) gets 401/404.
 */
@RestController
public class LegacyAvatarController {
    private static final Pattern FILENAME = Pattern.compile("[0-9a-fA-F-]{36}\\.(jpg|png)");
    private final UserProfileStore profiles;
    private final Path avatarStorageDirectory;

    public LegacyAvatarController(UserProfileStore profiles, @Value("${avatar.storage-dir}") String avatarStorageDirectory) {
        this.profiles = profiles;
        this.avatarStorageDirectory = Path.of(avatarStorageDirectory).toAbsolutePath().normalize();
    }

    @GetMapping("/uploads/avatars/{filename}")
    public ResponseEntity<Resource> avatar(@PathVariable String filename) {
        if (!FILENAME.matcher(filename).matches()) throw notFound();
        UserProfile profile = profiles.findExisting(CurrentUser.openId());
        String avatarUrl = profile == null || profile.avatarUrl() == null ? "" : profile.avatarUrl();
        if (!avatarUrl.endsWith("/uploads/avatars/" + filename)) throw notFound();
        Path file = avatarStorageDirectory.resolve(filename).normalize();
        if (!file.startsWith(avatarStorageDirectory) || !Files.isRegularFile(file)) throw notFound();
        MediaType type = filename.endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG;
        return ResponseEntity.ok()
                .contentType(type)
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(new FileSystemResource(file));
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "AVATAR_NOT_FOUND", "头像不存在");
    }
}
