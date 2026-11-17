package com.ftinoco.task.management.controllers;

import java.util.List;
import com.ftinoco.task.management.dtos.TaskDto;
import com.ftinoco.task.management.dtos.TaskInput;
import com.ftinoco.task.management.services.TaskService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class TaskController {
    private final TaskService service;
    public TaskController(TaskService service) { this.service = service; }
    @GetMapping("/task/{id}")
    public TaskDto getTask(@PathVariable int id) { return service.getTaskById(id); }
    @GetMapping("/task")
    public List<TaskDto> getTasks() { return service.getAllTasks(); }
    @PostMapping("/task")
    public TaskDto createTask(@Valid @RequestBody TaskInput input) { return service.addTask(input); }
    @PostMapping("/task/{parentId}/subtasks")
    public ResponseEntity<TaskDto> createSubtask(@PathVariable int parentId, @Valid @RequestBody TaskInput input) {
        TaskDto child = service.addSubtask(parentId, input);
        return ResponseEntity.created(java.net.URI.create("/task/" + child.id())).body(child);
    }
    @PutMapping("/task")
    public TaskDto updateTask(@Valid @RequestBody TaskInput input) { return service.updateTask(input); }
    @DeleteMapping("/task/{id}")
    public ResponseEntity<Void> deleteTask(@PathVariable int id) {
        service.deleteTask(id);
        return ResponseEntity.noContent().build();
    }
}
