package com.ftinoco.task.management.dtos;

import java.util.Date;
import com.ftinoco.task.management.entities.Status;
import jakarta.validation.constraints.*;

// Relationships are determined by the endpoint, never accepted from this payload.
public record TaskInput(Integer id,
        @NotBlank @Pattern(regexp = "(?sU).*\\S.*", message = "must contain a non-whitespace character") @Size(max = 64) String title,
        @Size(max = 256) String description,
        @NotNull Date dueDate,
        @NotNull Status status) { }
