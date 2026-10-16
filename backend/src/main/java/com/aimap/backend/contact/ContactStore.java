package com.aimap.backend.contact;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
public class ContactStore {
    private final ContactRepository contacts;
    private final RelationshipRepository relationships;
    private final boolean demoDataEnabled;

    public ContactStore(ContactRepository contacts, RelationshipRepository relationships,
                        @Value("${demo-data.enabled:false}") boolean demoDataEnabled) {
        this.contacts = contacts;
        this.relationships = relationships;
        this.demoDataEnabled = demoDataEnabled;
    }

    @PostConstruct
    void seed() {
        if (!demoDataEnabled || contacts.existsByOwnerId("demo")) return;
        Contact professor = save("demo", new ContactRequest("张教授", "南京邮电大学", "教授", "南京", "江苏", "中国", "13800000001", "zhang@example.com", "无线感知方向合作伙伴", List.of("无线感知", "高校专家")));
        Contact student = save("demo", new ContactRequest("王博士", "南京邮电大学", "博士生", "南京", "江苏", "中国", "13800000002", "wang@example.com", "张教授的学生", List.of("人工智能", "研究生")));
        Contact founder = save("demo", new ContactRequest("赵总", "星图科技", "联合创始人", "上海", "上海", "中国", "13800000003", "zhao@example.com", "产业合作联系人", List.of("产业合作", "创业")));
        Contact colleague = save("demo", new ContactRequest("李老师", "东南大学", "副教授", "南京", "江苏", "中国", "13800000004", "li@example.com", "共同参与学术活动", List.of("学术合作", "高校专家")));
        saveRelationship("demo", new RelationshipRequest(professor.id(), student.id(), "指导", "博士生导师关系"));
        saveRelationship("demo", new RelationshipRequest(professor.id(), colleague.id(), "合作", "共同研究项目"));
        saveRelationship("demo", new RelationshipRequest(professor.id(), founder.id(), "合作", "产学研交流"));
    }

    @Transactional(readOnly = true)
    public List<Contact> findAll(String ownerId) { return contacts.findByOwnerIdOrderByIdAsc(ownerId).stream().map(ContactEntity::toContact).toList(); }

    @Transactional(readOnly = true)
    public Contact findOne(String ownerId, Long id) { return contacts.findByIdAndOwnerId(id, ownerId).map(ContactEntity::toContact).orElse(null); }

    @Transactional
    public Contact save(String ownerId, ContactRequest request) {
        ContactEntity entity = new ContactEntity(ownerId);
        entity.apply(fromRequest(null, ownerId, request));
        return contacts.save(entity).toContact();
    }

    @Transactional
    public Contact update(String ownerId, Long id, ContactRequest request) {
        ContactEntity entity = contacts.findByIdAndOwnerId(id, ownerId).orElse(null);
        if (entity == null) return null;
        entity.apply(fromRequest(id, ownerId, request));
        return contacts.save(entity).toContact();
    }

    @Transactional
    public boolean delete(String ownerId, Long id) {
        ContactEntity entity = contacts.findByIdAndOwnerId(id, ownerId).orElse(null);
        if (entity == null) return false;
        relationships.deleteAll(relationships.findByOwnerId(ownerId).stream()
                .filter(r -> r.getSourceId().equals(id) || r.getTargetId().equals(id)).toList());
        contacts.delete(entity);
        return true;
    }

    @Transactional
    public Relationship saveRelationship(String ownerId, RelationshipRequest request) {
        if (findOne(ownerId, request.sourceId()) == null || findOne(ownerId, request.targetId()) == null || request.sourceId().equals(request.targetId())) {
            return null;
        }
        return relationships.save(new RelationshipEntity(ownerId, request.sourceId(), request.targetId(), request.type().trim(), blankToEmpty(request.note()))).toRelationship();
    }

    public List<Relationship> relationshipsFor(String ownerId) {
        return relationships.findByOwnerId(ownerId).stream().map(RelationshipEntity::toRelationship).toList();
    }

    @Transactional
    public boolean deleteRelationship(String ownerId, Long id) {
        RelationshipEntity relationship = relationships.findByIdAndOwnerId(id, ownerId).orElse(null);
        if (relationship == null) return false;
        relationships.delete(relationship);
        return true;
    }

    private Contact fromRequest(Long id, String ownerId, ContactRequest request) {
        return new Contact(id, ownerId, request.name().trim(), blankToEmpty(request.organization()), blankToEmpty(request.position()),
                blankToEmpty(request.city()), blankToEmpty(request.address()), request.latitude(), request.longitude(), blankToEmpty(request.province()), blankToEmpty(request.country()), blankToEmpty(request.phone()), blankToEmpty(request.email()),
                blankToEmpty(request.note()), request.tags() == null ? List.of() : request.tags().stream().filter(t -> t != null && !t.isBlank()).map(String::trim).distinct().toList());
    }

    private String blankToEmpty(String value) { return value == null ? "" : value.trim(); }
}
