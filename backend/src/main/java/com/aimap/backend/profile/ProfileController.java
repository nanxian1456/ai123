package com.aimap.backend.profile;

import com.aimap.backend.auth.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/me")
public class ProfileController {
    private final UserProfileStore profiles;
    private final Path avatarStorageDirectory;
    private final String publicBaseUrl;

    public ProfileController(
            UserProfileStore profiles,
            @Value("${avatar.storage-dir}") String avatarStorageDirectory,
            @Value("${app.public-base-url}") String publicBaseUrl
    ) {
        this.profiles = profiles;
        this.avatarStorageDirectory = Path.of(avatarStorageDirectory).toAbsolutePath().normalize();
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    @GetMapping
    public UserProfile me() { return profiles.ensure(CurrentUser.openId()); }

    @PatchMapping
    public UserProfile update(@Valid @RequestBody UserProfileRequest request) { return profiles.update(CurrentUser.openId(), request); }

    @PostMapping(value = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UserProfile uploadAvatar(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024) throw new AvatarUploadException("请上传不超过 5MB 的图片");
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        if (!Set.of(MediaType.IMAGE_JPEG_VALUE, MediaType.IMAGE_PNG_VALUE).contains(contentType)) {
            throw new AvatarUploadException("仅支持 JPG 或 PNG 图片");
        }

        try (InputStream input = file.getInputStream()) {
            BufferedImage image = ImageIO.read(input);
            if (image == null) throw new AvatarUploadException("上传的文件不是有效图片");
        } catch (IOException exception) {
            throw new AvatarUploadException("图片读取失败");
        }

        String extension = contentType.equals(MediaType.IMAGE_PNG_VALUE) ? "png" : "jpg";
        String filename = UUID.randomUUID() + "." + extension;
        Path targetPath = avatarStorageDirectory.resolve(filename).normalize();
        if (!targetPath.startsWith(avatarStorageDirectory)) throw new AvatarUploadException("非法的文件路径");
        try {
            Files.createDirectories(avatarStorageDirectory);
            try (InputStream input = file.getInputStream()) {
                Files.copy(input, targetPath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException exception) {
            throw new AvatarUploadException("头像保存失败");
        }
        return profiles.updateAvatar(CurrentUser.openId(), publicBaseUrl + "/uploads/avatars/" + filename);
    }

    @ResponseStatus(HttpStatus.BAD_REQUEST)
    static class AvatarUploadException extends RuntimeException {
        AvatarUploadException(String message) { super(message); }
    }
}
