package com.ftinoco.task.management.repository;

import java.util.List;
import java.util.Optional;
import com.ftinoco.task.management.entities.Task;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<Task, Integer> {
    List<Task> findByParentIsNullOrderByIdAsc();

    @Query("select t from Task t left join fetch t.children where t.id = :id")
    Optional<Task> findDetail(@Param("id") int id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Task t where t.id = :id")
    Optional<Task> lockById(@Param("id") int id);

    @Query("select t.parent.id from Task t where t.id = :id")
    Optional<Integer> findParentId(@Param("id") int id);

    List<Task> findByParentIdOrderByIdAsc(int parentId);
}
