package com.aimap.backend.contact;

import com.aimap.backend.error.ApiException;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ContactService {
    private final ContactRepository contacts;
    private final RelationshipRepository relationships;
    private final boolean demoDataEnabled;

    public ContactService(
            ContactRepository contacts,
            RelationshipRepository relationships,
            @Value("${demo-data.enabled:false}") boolean demoDataEnabled
    ) {
        this.contacts = contacts;
        this.relationships = relationships;
        this.demoDataEnabled = demoDataEnabled;
    }

    @PostConstruct
    void seed() {
        if (!demoDataEnabled || contacts.countByOwnerId("demo") > 0) return;
        Contact professor = save("demo", new ContactRequest("张教授", "南京邮电大学", "教授", "南京", "江苏", "13800000001", "zhang@example.com", "无线感知方向合作伙伴", List.of("无线感知", "高校专家")));
        Contact student = save("demo", new ContactRequest("王博士", "南京邮电大学", "博士生", "南京", "江苏", "13800000002", "wang@example.com", "张教授的学生", List.of("人工智能", "研究生")));
        Contact founder = save("demo", new ContactRequest("赵总", "星图科技", "联合创始人", "上海", "上海", "13800000003", "zhao@example.com", "产业合作联系人", List.of("产业合作", "创业")));
        Contact teacher = save("demo", new ContactRequest("李老师", "东南大学", "副教授", "南京", "江苏", "13800000004", "li@example.com", "共同参与学术活动", List.of("学术合作", "高校专家")));
        saveRelationship("demo", new RelationshipRequest(professor.id(), student.id(), "指导", "博士生导师关系"));
        saveRelationship("demo", new RelationshipRequest(professor.id(), teacher.id(), "合作", "共同研究项目"));
        saveRelationship("demo", new RelationshipRequest(professor.id(), founder.id(), "合作", "产学研交流"));
    }

    @Transactional(readOnly = true)
    public List<Contact> findAll(String ownerId) {
        return contacts.findByOwnerIdOrderByIdAsc(ownerId).stream().map(this::toContact).toList();
    }

    @Transactional(readOnly = true)
    public PagedResponse<Contact> search(String ownerId, String keyword, String city, String tag, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "id"));
        return PagedResponse.from(contacts.search(ownerId, clean(keyword), clean(city), clean(tag), pageable).map(this::toContact));
    }

    @Transactional(readOnly = true)
    public Contact findOne(String ownerId, Long id) {
        return contacts.findByOwnerIdAndId(ownerId, id).map(this::toContact).orElse(null);
    }

    @Transactional
    @CacheEvict(cacheNames = "contactInsights", allEntries = true)
    public Contact save(String ownerId, ContactRequest request) {
        return toContact(contacts.save(apply(new ContactEntity(ownerId), request)));
    }

    @Transactional
    @CacheEvict(cacheNames = "contactInsights", allEntries = true)
    public Contact update(String ownerId, Long id, ContactRequest request) {
        ContactEntity entity = contacts.findByOwnerIdAndId(ownerId, id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "CONTACT_NOT_FOUND", "联系人不存在"));
        return toContact(contacts.save(apply(entity, request)));
    }

    @Transactional
    @CacheEvict(cacheNames = "contactInsights", allEntries = true)
    public void delete(String ownerId, Long id) {
        ContactEntity entity = contacts.findByOwnerIdAndId(ownerId, id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "CONTACT_NOT_FOUND", "联系人不存在"));
        relationships.deleteForContact(ownerId, id);
        contacts.delete(entity);
    }

    @Transactional
    public Relationship saveRelationship(String ownerId, RelationshipRequest request) {
        if (request.sourceId().equals(request.targetId())
                || contacts.findByOwnerIdAndId(ownerId, request.sourceId()).isEmpty()
                || contacts.findByOwnerIdAndId(ownerId, request.targetId()).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_RELATIONSHIP", "关系对象无效");
        }
        RelationshipEntity entity = new RelationshipEntity(ownerId, request.sourceId(), request.targetId(), request.type().trim(), clean(request.note()));
        return toRelationship(relationships.save(entity));
    }

    @Transactional(readOnly = true)
    public List<Relationship> relationshipsFor(String ownerId) {
        return relationships.findByOwnerIdOrderByIdAsc(ownerId).stream().map(this::toRelationship).toList();
    }

    @Transactional
    public void deleteRelationship(String ownerId, Long id) {
        RelationshipEntity entity = relationships.findByOwnerIdAndId(ownerId, id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RELATIONSHIP_NOT_FOUND", "关系不存在"));
        relationships.delete(entity);
    }

    private ContactEntity apply(ContactEntity entity, ContactRequest request) {
        entity.setName(request.name().trim());
        entity.setOrganization(clean(request.organization()));
        entity.setPosition(clean(request.position()));
        entity.setCity(clean(request.city()));
        entity.setProvince(clean(request.province()));
        entity.setPhone(clean(request.phone()));
        entity.setEmail(clean(request.email()));
        entity.setNote(clean(request.note()));
        entity.setTags(request.tags() == null ? List.of() : request.tags().stream().map(String::trim).distinct().toList());
        return entity;
    }

    private Contact toContact(ContactEntity entity) {
        return new Contact(entity.getId(), entity.getOwnerId(), entity.getName(), entity.getOrganization(), entity.getPosition(), entity.getCity(), entity.getProvince(), entity.getPhone(), entity.getEmail(), entity.getNote(), List.copyOf(entity.getTags()));
    }

    private Relationship toRelationship(RelationshipEntity entity) {
        return new Relationship(entity.getId(), entity.getOwnerId(), entity.getSourceId(), entity.getTargetId(), entity.getType(), entity.getNote());
    }

    private String clean(String value) { return value == null ? "" : value.trim(); }
}
