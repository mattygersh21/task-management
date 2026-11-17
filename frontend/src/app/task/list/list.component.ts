import { Component } from '@angular/core';
import { TaskDraftService } from '../task-draft.service';
import { Task, TaskFormContext } from '../task';
import { TaskService } from '../task.service';
import { MatTableModule } from '@angular/material/table';
import { MatButton } from '@angular/material/button';
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle
} from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../confirm-dialog/confirm-dialog.component';
import { CreateComponent } from '../create/create.component';

@Component({
  selector: 'app-list',
  imports: [
    MatTableModule,
    MatButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardSubtitle,
    MatCardTitle,
    MatIcon,
    CommonModule
  ],
  templateUrl: './list.component.html',
  styleUrl: './list.component.scss'
})
export class ListComponent {

  tasks: Task[] = [];
  globalError = '';
  displayedColumns: string[] = ['id', 'title', 'description', 'dueDate', 'status', 'actions'];

  constructor(
    public taskService: TaskService,
    private taskDraftService: TaskDraftService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.loadTable();
    const draft = this.taskDraftService.read();
    if (draft) this.showForm(draft.parentId ? { taskId: draft.taskId, parentId: draft.parentId } : draft.taskId || null);
  }

  loadTable(): void {
    this.taskService.getAll().subscribe({
      next: (data: Task[]) => { this.tasks = data.filter(task => task.status === 'PENDING'); },
      error: err => { this.globalError = err?.error?.message || 'Unable to load tasks. Please try again.'; }
    });
  }

  addTask(): void {
    this.showForm(null);
  }

  editTask(id: number): void {
    this.showForm(id);
  }

  showForm(id: number | TaskFormContext | null) : void {
    const dialogRef = this.dialog.open(CreateComponent, {
      width: '600px',
      disableClose: true,
      data: id
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadTable();
      }
    });
  }

  deleteTask(id: number): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { message: 'Delete this task and all its subtasks? This cannot be undone.', confirmLabel: 'Delete task and subtasks' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.taskService.delete(id).subscribe({ next: res => {
          this.tasks = this.tasks.filter(item => item.id !== id);
          this.taskDraftService.clearFamily(id);
        }, error: err => { this.globalError = err?.error?.message || 'Unable to delete task. Please try again.'; } });
      }
    });
  }
}
