package com.aimap.backend.contact;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class ContactStore {
    private final Map<Long, Contact> contacts = new ConcurrentHashMap<>();
    private final Map<Long, Relationship> relationships = new ConcurrentHashMap<>();
    private final AtomicLong contactSequence = new AtomicLong(100);
    private final AtomicLong relationshipSequence = new AtomicLong(1000);
    private final boolean demoDataEnabled;

    public ContactStore(@Value("${demo-data.enabled:false}") boolean demoDataEnabled) {
        this.demoDataEnabled = demoDataEnabled;
    }

    @PostConstruct
    void seed() {
        if (!demoDataEnabled) return;
        save("demo", new ContactRequest("张教授", "南京邮电大学", "教授", "南京", "江苏", "13800000001", "zhang@example.com", "无线感知方向合作伙伴", List.of("无线感知", "高校专家")));
        save("demo", new ContactRequest("王博士", "南京邮电大学", "博士生", "南京", "江苏", "13800000002", "wang@example.com", "张教授的学生", List.of("人工智能", "研究生")));
        save("demo", new ContactRequest("赵总", "星图科技", "联合创始人", "上海", "上海", "13800000003", "zhao@example.com", "产业合作联系人", List.of("产业合作", "创业")));
        save("demo", new ContactRequest("李老师", "东南大学", "副教授", "南京", "江苏", "13800000004", "li@example.com", "共同参与学术活动", List.of("学术合作", "高校专家")));
        saveRelationship("demo", new RelationshipRequest(101L, 102L, "指导", "博士生导师关系"));
        saveRelationship("demo", new RelationshipRequest(101L, 104L, "合作", "共同研究项目"));
        saveRelationship("demo", new RelationshipRequest(101L, 103L, "合作", "产学研交流"));
    }

    public List<Contact> findAll(String ownerId) {
        return contacts.values().stream().filter(c -> c.ownerId().equals(ownerId)).sorted(Comparator.comparing(Contact::id)).toList();
    }

    public Contact findOne(String ownerId, Long id) {
        Contact contact = contacts.get(id);
        return contact != null && contact.ownerId().equals(ownerId) ? contact : null;
    }

    public Contact save(String ownerId, ContactRequest request) {
        long id = contactSequence.incrementAndGet();
        Contact contact = fromRequest(id, ownerId, request);
        contacts.put(id, contact);
        return contact;
    }

    public Contact update(String ownerId, Long id, ContactRequest request) {
        if (findOne(ownerId, id) == null) return null;
        Contact contact = fromRequest(id, ownerId, request);
        contacts.put(id, contact);
        return contact;
    }

    public boolean delete(String ownerId, Long id) {
        if (findOne(ownerId, id) == null) return false;
        contacts.remove(id);
        relationships.values().removeIf(r -> r.ownerId().equals(ownerId) && (r.sourceId().equals(id) || r.targetId().equals(id)));
        return true;
    }

    public Relationship saveRelationship(String ownerId, RelationshipRequest request) {
        if (findOne(ownerId, request.sourceId()) == null || findOne(ownerId, request.targetId()) == null || request.sourceId().equals(request.targetId())) {
            return null;
        }
        long id = relationshipSequence.incrementAndGet();
        Relationship relationship = new Relationship(id, ownerId, request.sourceId(), request.targetId(), request.type().trim(), blankToEmpty(request.note()));
        relationships.put(id, relationship);
        return relationship;
    }

    public List<Relationship> relationshipsFor(String ownerId) {
        return relationships.values().stream().filter(r -> r.ownerId().equals(ownerId)).toList();
    }

    public boolean deleteRelationship(String ownerId, Long id) {
        Relationship relationship = relationships.get(id);
        if (relationship == null || !relationship.ownerId().equals(ownerId)) return false;
        relationships.remove(id);
        return true;
    }

    private Contact fromRequest(long id, String ownerId, ContactRequest request) {
        return new Contact(id, ownerId, request.name().trim(), blankToEmpty(request.organization()), blankToEmpty(request.position()),
                blankToEmpty(request.city()), blankToEmpty(request.province()), blankToEmpty(request.phone()), blankToEmpty(request.email()),
                blankToEmpty(request.note()), request.tags() == null ? List.of() : request.tags().stream().filter(t -> t != null && !t.isBlank()).map(String::trim).distinct().toList());
    }

    private String blankToEmpty(String value) { return value == null ? "" : value.trim(); }
}
