package com.aimap.backend.profile;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UserProfileRequest(
        @NotBlank @Size(max = 30) String nickname,
        @Size(max = 60) String organization,
        @Size(max = 40) String position,
        @Size(max = 30) String city,
        @Size(max = 200) String bio,
        @Pattern(regexp = "male-1|male-2|female-1|female-2", message = "头像类型无效") String avatarType
) { }
