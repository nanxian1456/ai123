package com.aimap.backend.profile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "published_profiles")
public class PublishedProfileEntity {
    @Id @Column(name = "owner_id", length = 128) private String ownerId;
    @Column(nullable = false, length = 30) private String nickname = "";
    @Column(nullable = false, length = 100) private String organization = "";
    @Column(nullable = false, length = 100) private String position = "";
    @Column(nullable = false, length = 100) private String city = "";
    @Column(nullable = false, length = 500) private String bio = "";

    protected PublishedProfileEntity() { }
    public PublishedProfileEntity(String ownerId) { this.ownerId = ownerId; }
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
}
