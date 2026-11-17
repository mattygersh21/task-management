package com.ftinoco.task.management.entities;

import java.util.Date;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.*; 
 
@Entity
@Table(name = "task")
public class Task {
	
	@Id
	@SequenceGenerator(name="task_generator", sequenceName = "seq_task_id", allocationSize = 1 )
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "task_generator")
	private int id;

	private String title;
	
	private String description;

    @Temporal(TemporalType.DATE)
    @Column(name = "due_date")
	private Date dueDate;
    
    @Enumerated(EnumType.STRING)
	private Status status;
	
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Task parent;

    @OneToMany(mappedBy = "parent", fetch = FetchType.LAZY)
    @OrderBy("id ASC")
    private List<Task> children = new ArrayList<>();

    public Task getParent() { return parent; }
    public void setParent(Task parent) { this.parent = parent; }
    public List<Task> getChildren() { return children; }

	public int getId() {
		return id;
	}
	public void setId(int id) {
		this.id = id;
	}
	
	public String getTitle() {
		return title;
	}
	public void setTitle(String title) {
		this.title = title;
	}
	
	public String getDescription() {
		return description;
	}
	public void setDescription(String description) {
		this.description = description;
	}
	
	public Date getDueDate() {
		return dueDate;
	}
	public void setDueDate(Date dueDate) {
		this.dueDate = dueDate;
	}
	
	public Status getStatus() {
		return status;
	}
	public void setStatus(Status status) {
		this.status = status;
	}
}
