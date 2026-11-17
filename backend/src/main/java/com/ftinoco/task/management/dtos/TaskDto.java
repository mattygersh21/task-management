package com.ftinoco.task.management.dtos;

import java.util.Date;
import java.util.List;
import com.ftinoco.task.management.entities.Status;

public record TaskDto(int id, String title, String description, Date dueDate,
        Status status, Integer parentId, List<SubtaskDto> subtasks) {
    // A child has no nested parent or child objects, preventing recursive JSON.
    public record SubtaskDto(int id, String title, String description, Date dueDate,
            Status status, int parentId) { }
}
