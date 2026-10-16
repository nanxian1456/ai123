package com.aimap.backend.contact;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "contacts")
public class ContactEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "owner_id", nullable = false, length = 128) private String ownerId;
    @Column(nullable = false, length = 50) private String name = "";
    @Column(nullable = false, length = 100) private String organization = "";
    @Column(nullable = false, length = 50) private String position = "";
    @Column(nullable = false, length = 50) private String city = "";
    @Column(length = 200) private String address = "";
    private Double latitude;
    private Double longitude;
    @Column(nullable = false, length = 50) private String province = "";
    @Column(nullable = false, length = 50) private String country = "";
    @Column(nullable = false, length = 30) private String phone = "";
    @Column(nullable = false, length = 100) private String email = "";
    @Column(nullable = false, length = 500) private String note = "";
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "contact_tags", joinColumns = @JoinColumn(name = "contact_id"))
    @OrderColumn(name = "tag_order")
    @Column(name = "tag", nullable = false, length = 20)
    private List<String> tags = new ArrayList<>();

    protected ContactEntity() { }
    public ContactEntity(String ownerId) { this.ownerId = ownerId; }

    public void apply(Contact contact) {
        name = contact.name();
        organization = contact.organization();
        position = contact.position();
        city = contact.city();
        address = contact.address();
        latitude = contact.latitude();
        longitude = contact.longitude();
        province = contact.province();
        country = contact.country();
        phone = contact.phone();
        email = contact.email();
        note = contact.note();
        tags.clear();
        tags.addAll(contact.tags());
    }

    public Contact toContact() {
        return new Contact(id, ownerId, name, organization, position, city, address == null ? "" : address, latitude, longitude, province, country, phone, email, note, List.copyOf(tags));
    }
}
