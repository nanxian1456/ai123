package com.aimap.backend.profile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "user_profiles")
public class UserProfileEntity {
    @Id
    @Column(name = "owner_id", nullable = false, length = 128)
    private String ownerId;
    @Column(nullable = false, length = 30) private String nickname = "";
    @Column(nullable = false, length = 100) private String organization = "";
    @Column(nullable = false, length = 100) private String position = "";
    @Column(nullable = false, length = 100) private String city = "";
    @Column(nullable = false, length = 500) private String bio = "";
    @Column(nullable = false, length = 20) private String avatarType = "male-1";
    @Column(length = 500) private String avatarUrl = "";
    @Column(nullable = false) private boolean avatarVisible;
    @Column(nullable = false) private boolean nicknameVisible;
    @Column(nullable = false) private boolean organizationVisible;
    @Column(nullable = false) private boolean positionVisible;
    @Column(nullable = false) private boolean cityVisible;
    @Column(nullable = false) private boolean bioVisible;
    @Column(nullable = false) private boolean profileCompleted;

    protected UserProfileEntity() { }
    public UserProfileEntity(String ownerId) { this.ownerId = ownerId; }
    public String getOwnerId() { return ownerId; }
    public String getNickname() { return nickname; }
    public void setNickname(String value) { nickname = value; }
    public String getOrganization() { return organization; }
    public void setOrganization(String value) { organization = value; }
    public String getPosition() { return position; }
    public void setPosition(String value) { position = value; }
    public String getCity() { return city; }
    public void setCity(String value) { city = value; }
    public String getBio() { return bio; }
    public void setBio(String value) { bio = value; }
    public String getAvatarType() { return avatarType; }
    public void setAvatarType(String value) { avatarType = value; }
    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String value) { avatarUrl = value; }
    public boolean isAvatarVisible() { return avatarVisible; }
    public void setAvatarVisible(boolean value) { avatarVisible = value; }
    public boolean isNicknameVisible() { return nicknameVisible; }
    public void setNicknameVisible(boolean value) { nicknameVisible = value; }
    public boolean isOrganizationVisible() { return organizationVisible; }
    public void setOrganizationVisible(boolean value) { organizationVisible = value; }
    public boolean isPositionVisible() { return positionVisible; }
    public void setPositionVisible(boolean value) { positionVisible = value; }
    public boolean isCityVisible() { return cityVisible; }
    public void setCityVisible(boolean value) { cityVisible = value; }
    public boolean isBioVisible() { return bioVisible; }
    public void setBioVisible(boolean value) { bioVisible = value; }
    public boolean isProfileCompleted() { return profileCompleted; }
    public void setProfileCompleted(boolean value) { profileCompleted = value; }
}
