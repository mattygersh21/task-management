package com.ftinoco.task.management.controllers;

import java.util.Map;
import java.util.stream.Collectors;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.dao.*;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class TaskErrors {
    @ExceptionHandler(EntityNotFoundException.class)
    ResponseEntity<?> missing(EntityNotFoundException ex) { return error(404, ex.getMessage()); }
    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<?> invalid(IllegalArgumentException ex) { return error(400, ex.getMessage()); }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation(MethodArgumentNotValidException ex) {
        return error(400, ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage()).distinct().sorted().collect(Collectors.joining("; ")));
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<?> malformed(HttpMessageNotReadableException ex) { return error(400, "Invalid request. Check the date and status (PENDING or COMPLETED)."); }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> constraint(DataIntegrityViolationException ex) {
        // Expose only the known, user-facing parent date message from our trigger.
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof org.hibernate.exception.ConstraintViolationException constraint
                    && "task_parent_due_date".equals(constraint.getConstraintName())) {
                String message = constraint.getSQLException().getMessage().split("\\n", 2)[0];
                return error(400, message.replaceFirst("^ERROR: *", ""));
            }
        }
        // Do not leak raw SQL or server diagnostics to clients.
        return error(400, "The task violates a database rule. Refresh the parent and subtasks, then check their dates and relationship.");
    }
    @ExceptionHandler(PessimisticLockingFailureException.class)
    ResponseEntity<?> concurrent(PessimisticLockingFailureException ex) { return error(409, "This task changed concurrently. Refresh and try again."); }
    private ResponseEntity<?> error(int status, String message) { return ResponseEntity.status(status).body(Map.of("message", message)); }
}
