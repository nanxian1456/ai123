package com.aimap.backend.contact;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ContactRepository extends JpaRepository<ContactEntity, Long> {
    List<ContactEntity> findByOwnerIdOrderByIdAsc(String ownerId);
    Optional<ContactEntity> findByOwnerIdAndId(String ownerId, Long id);
    long countByOwnerId(String ownerId);

    @Query(value = """
            select distinct c from ContactEntity c left join c.tags t
            where c.ownerId = :ownerId
              and (:keyword = '' or lower(c.name) like lower(concat('%', :keyword, '%'))
                   or lower(c.organization) like lower(concat('%', :keyword, '%'))
                   or lower(c.position) like lower(concat('%', :keyword, '%')))
              and (:city = '' or c.city = :city)
              and (:tag = '' or t = :tag)
            """,
            countQuery = """
            select count(distinct c.id) from ContactEntity c left join c.tags t
            where c.ownerId = :ownerId
              and (:keyword = '' or lower(c.name) like lower(concat('%', :keyword, '%'))
                   or lower(c.organization) like lower(concat('%', :keyword, '%'))
                   or lower(c.position) like lower(concat('%', :keyword, '%')))
              and (:city = '' or c.city = :city)
              and (:tag = '' or t = :tag)
            """)
    Page<ContactEntity> search(
            @Param("ownerId") String ownerId,
            @Param("keyword") String keyword,
            @Param("city") String city,
            @Param("tag") String tag,
            Pageable pageable
    );
}
