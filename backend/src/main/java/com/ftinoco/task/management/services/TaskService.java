package com.ftinoco.task.management.services;

import java.time.ZoneOffset;
import java.time.LocalDate;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;
import com.ftinoco.task.management.dtos.TaskDto;
import com.ftinoco.task.management.dtos.TaskInput;
import com.ftinoco.task.management.entities.Task;
import com.ftinoco.task.management.repository.TaskRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class TaskService {
    private final TaskRepository repository;
    public TaskService(TaskRepository repository) { this.repository = repository; }

    @Transactional(readOnly = true)
    public TaskDto getTaskById(int id) {
        return dto(repository.findDetail(id).orElseThrow(() -> missing(id)), true);
    }

    @Transactional(readOnly = true)
    public List<TaskDto> getAllTasks() {
        // List responses do not traverse collections, so query count stays constant.
        return repository.findByParentIsNullOrderByIdAsc().stream().map(t -> dto(t, false)).toList();
    }

    public TaskDto addTask(TaskInput input) {
        Task task = new Task();
        apply(task, input);
        return dto(repository.saveAndFlush(task), false);
    }

    public TaskDto addSubtask(int parentId, TaskInput input) {
        Task parent = locked(parentId);
        if (parent.getParent() != null) throw new IllegalArgumentException("Subtasks cannot have subtasks.");
        checkChildDate(input.dueDate(), parent.getDueDate());
        Task child = new Task();
        child.setParent(parent);
        apply(child, input);
        return dto(repository.saveAndFlush(child), false);
    }

    public TaskDto updateTask(TaskInput input) {
        if (input.id() == null || input.id() <= 0) throw new IllegalArgumentException("A valid task ID is required.");
        // Determine the immutable parent first, then lock root before child.
        Integer parentId = repository.findParentId(input.id()).orElse(null);
        Task parent = parentId == null ? null : locked(parentId);
        Task task = locked(input.id());
        if (parent != null) checkChildDate(input.dueDate(), parent.getDueDate());
        else {
            List<Task> blocking = repository.findByParentIdOrderByIdAsc(task.getId()).stream()
                    .filter(c -> day(c.getDueDate()).isAfter(day(input.dueDate()))).toList();
            if (!blocking.isEmpty()) throw new IllegalArgumentException("Update the due date of "
                    + blocking.stream().map(c -> "\"" + c.getTitle() + "\" (#" + c.getId() + ", " + day(c.getDueDate()) + ")")
                        .collect(Collectors.joining(", "))
                    + " to " + day(input.dueDate()) + " or earlier before saving this parent due date.");
        }
        apply(task, input);
        repository.saveAndFlush(task);
        return dto(task, false);
    }

    public void deleteTask(int id) {
        Integer parentId = repository.findParentId(id).orElse(null);
        if (parentId != null) locked(parentId);
        Task task = locked(id);
        // No JPA remove cascade: PostgreSQL deletes children via the foreign key.
        repository.delete(task);
        repository.flush();
    }

    private Task locked(int id) { return repository.lockById(id).orElseThrow(() -> missing(id)); }
    private EntityNotFoundException missing(int id) { return new EntityNotFoundException("Task not found with id: " + id); }
    private static LocalDate day(Date value) {
        if (value instanceof java.sql.Date sqlDate) return sqlDate.toLocalDate();
        return value.toInstant().atZone(ZoneOffset.UTC).toLocalDate();
    }
    private void checkChildDate(Date child, Date parent) {
        if (day(child).isAfter(day(parent))) throw new IllegalArgumentException("Subtask due date must be " + day(parent) + " or earlier (the parent due date).");
    }
    private void apply(Task task, TaskInput input) {
        task.setTitle(input.title().strip());
        task.setDescription(input.description());
        task.setDueDate(java.sql.Date.valueOf(day(input.dueDate())));
        task.setStatus(input.status());
    }
    private TaskDto dto(Task task, boolean includeChildren) {
        Integer parentId = task.getParent() == null ? null : task.getParent().getId();
        List<TaskDto.SubtaskDto> children = !includeChildren ? List.of() : task.getChildren().stream()
                .map(c -> new TaskDto.SubtaskDto(c.getId(), c.getTitle(), c.getDescription(), c.getDueDate(), c.getStatus(), task.getId())).toList();
        return new TaskDto(task.getId(), task.getTitle(), task.getDescription(), task.getDueDate(), task.getStatus(), parentId, children);
    }
}
