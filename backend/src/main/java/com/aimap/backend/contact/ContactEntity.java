package com.aimap.backend.contact;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "contacts", indexes = {
        @Index(name = "idx_contacts_owner", columnList = "owner_id"),
        @Index(name = "idx_contacts_owner_city", columnList = "owner_id,city")
})
public class ContactEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "owner_id", nullable = false, length = 128) private String ownerId;
    @Column(nullable = false, length = 50) private String name;
    @Column(nullable = false, length = 100) private String organization = "";
    @Column(nullable = false, length = 50) private String position = "";
    @Column(nullable = false, length = 50) private String city = "";
    @Column(nullable = false, length = 50) private String province = "";
    @Column(nullable = false, length = 30) private String phone = "";
    @Column(nullable = false, length = 100) private String email = "";
    @Column(nullable = false, length = 500) private String note = "";

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "contact_tags", joinColumns = @JoinColumn(name = "contact_id"))
    @OrderColumn(name = "tag_order")
    @Column(name = "tag", nullable = false, length = 20)
    private List<String> tags = new ArrayList<>();

    protected ContactEntity() { }

    public ContactEntity(String ownerId) {
        this.ownerId = ownerId;
    }

    public Long getId() { return id; }
    public String getOwnerId() { return ownerId; }
    public String getName() { return name; }
    public void setName(String value) { name = value; }
    public String getOrganization() { return organization; }
    public void setOrganization(String value) { organization = value; }
    public String getPosition() { return position; }
    public void setPosition(String value) { position = value; }
    public String getCity() { return city; }
    public void setCity(String value) { city = value; }
    public String getProvince() { return province; }
    public void setProvince(String value) { province = value; }
    public String getPhone() { return phone; }
    public void setPhone(String value) { phone = value; }
    public String getEmail() { return email; }
    public void setEmail(String value) { email = value; }
    public String getNote() { return note; }
    public void setNote(String value) { note = value; }
    public List<String> getTags() { return tags; }
    public void setTags(List<String> value) { tags = new ArrayList<>(value); }
}
