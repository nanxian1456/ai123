package com.aimap.backend.contact;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ContactRequest(
        @NotBlank(message = "姓名不能为空") @Size(max = 50) String name,
        @Size(max = 100) String organization,
        @Size(max = 50) String position,
        @Size(max = 50) String city,
        @Size(max = 200) String address,
        Double latitude,
        Double longitude,
        @Size(max = 50) String province,
        @Size(max = 50) String country,
        @Size(max = 30) @Pattern(regexp = "^$|^[0-9+()\\- ]{6,30}$", message = "手机号格式无效") String phone,
        @Size(max = 100) @Email(message = "邮箱格式无效") String email,
        @Size(max = 500) String note,
        @Size(max = 10, message = "标签最多 10 个") List<@NotBlank @Size(max = 20) String> tags
) {
    public ContactRequest(String name, String organization, String position, String city, String province,
                          String phone, String email, String note, List<String> tags) {
        this(name, organization, position, city, "", null, null, province, "", phone, email, note, tags);
    }
}
