package com.aimap.backend.profile;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.net.URI;
import java.nio.file.*;

@Component
public class AccountAvatarCleanup {
    private final Path directory;
    private final URI publicBase;
    public AccountAvatarCleanup(@Value("${avatar.storage-dir}") String directory, @Value("${app.public-base-url}") String publicBase) {
        this.directory = Path.of(directory).toAbsolutePath().normalize(); this.publicBase = URI.create(publicBase);
    }
    public void afterCommit(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) return;
        final Path target;
        try {
            URI uri = URI.create(avatarUrl);
            if (uri.isAbsolute() && (!java.util.Objects.equals(uri.getHost(), publicBase.getHost()) ||
                    !java.util.Objects.equals(uri.getScheme(), publicBase.getScheme()) || uri.getPort() != publicBase.getPort())) return;
            String path = uri.getPath();
            if (path == null || !path.matches("/(api/me/avatar|uploads/avatars)/[A-Za-z0-9-]{1,80}\\.(jpg|jpeg|png)")) return;
            target = directory.resolve(path.substring(path.lastIndexOf('/') + 1)).normalize();
            if (!target.startsWith(directory)) return;
        } catch (IllegalArgumentException invalid) { return; }
        Runnable cleanup = () -> {
            try {
                if (Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS) && target.toRealPath().startsWith(directory.toRealPath())) Files.deleteIfExists(target);
            } catch (java.io.IOException error) {
                org.slf4j.LoggerFactory.getLogger(AccountAvatarCleanup.class).warn("账号已注销，当前头像文件清理失败，请检查存储权限");
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { cleanup.run(); }
            });
        } else cleanup.run();
    }
}
