package com.aimap.backend.profile;

import com.aimap.backend.auth.CurrentUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.Resource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.nio.file.*;
import java.io.IOException;

@RestController
public class AvatarController {
    private final UserProfileStore profiles;
    private final Path directory;
    public AvatarController(UserProfileStore profiles, @Value("${avatar.storage-dir}") String directory) {
        this.profiles = profiles; this.directory = Path.of(directory).toAbsolutePath().normalize();
    }
    @GetMapping({"/api/me/avatar/{filename}","/uploads/avatars/{filename}"})
    public ResponseEntity<Resource> download(@PathVariable String filename) {
        if (!filename.matches("[A-Za-z0-9-]{1,80}\\.(png|jpg|jpeg)")) return ResponseEntity.notFound().build();
        UserProfile profile = profiles.findExisting(CurrentUser.openId());
        if (profile == null || profile.avatarUrl() == null) return ResponseEntity.notFound().build();
        try {
            String storedPath = URI.create(profile.avatarUrl()).getPath();
            if (storedPath == null || (!storedPath.endsWith("/uploads/avatars/" + filename) && !storedPath.endsWith("/api/me/avatar/" + filename))) return ResponseEntity.notFound().build();
            Path file = directory.resolve(filename).normalize();
            if (!file.startsWith(directory) || !Files.isRegularFile(file)) return ResponseEntity.notFound().build();
            Path realDirectory = directory.toRealPath();
            Path realFile = file.toRealPath();
            if (!realFile.startsWith(realDirectory)) return ResponseEntity.notFound().build();
            MediaType type = filename.endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG;
            return ResponseEntity.ok().contentType(type).header("Cache-Control", "private, no-store").body(new FileSystemResource(realFile));
        } catch (IllegalArgumentException | IOException ignored) { return ResponseEntity.notFound().build(); }
    }
}
