package com.aimap.backend.profile;

import com.aimap.backend.auth.CurrentUser;
import com.aimap.backend.error.ApiException;
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
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Iterator;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

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

    @PatchMapping("/visibility")
    public UserProfile updateVisibility(@Valid @RequestBody ProfileVisibilityRequest request) {
        return profiles.updateVisibility(CurrentUser.openId(), request.toVisibility());
    }

    @PostMapping(value = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UserProfile uploadAvatar(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024) throw invalidAvatar("请上传不超过 5MB 的图片");
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        if (!Set.of(MediaType.IMAGE_JPEG_VALUE, MediaType.IMAGE_PNG_VALUE).contains(contentType)) {
            throw invalidAvatar("仅支持 JPG 或 PNG 图片");
        }

        try (InputStream input = file.getInputStream(); ImageInputStream imageInput = ImageIO.createImageInputStream(input)) {
            if (imageInput == null) throw invalidAvatar("上传的文件不是有效图片");
            Iterator<ImageReader> readers = ImageIO.getImageReaders(imageInput);
            if (!readers.hasNext()) throw invalidAvatar("上传的文件不是有效图片");
            ImageReader reader = readers.next();
            try {
                reader.setInput(imageInput, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 4096 || height > 4096 || (long) width * height > 16_000_000L) {
                    throw invalidAvatar("图片尺寸不能超过 4096×4096");
                }
            } finally {
                reader.dispose();
            }
        } catch (IOException exception) {
            throw invalidAvatar("图片读取失败");
        }

        String extension = contentType.equals(MediaType.IMAGE_PNG_VALUE) ? "png" : "jpg";
        String filename = UUID.randomUUID() + "." + extension;
        Path targetPath = avatarStorageDirectory.resolve(filename).normalize();
        if (!targetPath.startsWith(avatarStorageDirectory)) throw invalidAvatar("非法的文件路径");
        try {
            Files.createDirectories(avatarStorageDirectory);
            try (InputStream input = file.getInputStream()) {
                Files.copy(input, targetPath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException exception) {
            throw invalidAvatar("头像保存失败");
        }
        return profiles.updateAvatar(CurrentUser.openId(), publicBaseUrl + "/uploads/avatars/" + filename);
    }

    private ApiException invalidAvatar(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_AVATAR", message);
    }
}
