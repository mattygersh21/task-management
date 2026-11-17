import { Component, Inject, OnDestroy, OnInit, Optional } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogContent,
  MatDialogModule,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, provideNativeDateAdapter } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common';
import { TaskService } from '../task.service';
import { Task, TaskFormContext } from '../task';
import { ConfirmDialogComponent } from '../../confirm-dialog/confirm-dialog.component';
import { Observable, Subscription } from 'rxjs';
import { TaskDraftService } from '../task-draft.service';

@Component({
  selector: 'app-create',
  imports: [
    MatDialogModule,
    MatDialogActions,
    MatDialogContent,
    MatButton,
    MatDialogTitle,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSelectModule,
    CommonModule
  ],
  templateUrl: './create.component.html',
  styleUrl: './create.component.scss',
  providers: [provideNativeDateAdapter()],
})
export class CreateComponent implements OnInit, OnDestroy {

  private subscriptions = new Subscription();
  taskId = 0;
  parentId?: number;
  parentTask?: Task;
  children: Task[] = [];
  savedDueDate = '';
  globalError = '';
  notice = '';
  descCharLength = 256;
  dialogTitle = 'New Task';
  statuses = ['PENDING', 'COMPLETED'];
  loading = false;
  saving = false;
  changed = false;
  private detailReady = false;

  taskForm = new FormGroup({
    title: new FormControl('', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(64)]),
    description: new FormControl('', [Validators.maxLength(this.descCharLength)]),
    dueDate: new FormControl<Date | null>(null, [Validators.required]),
    status: new FormControl('', [Validators.required])
  });

  constructor(
    public dialogRef: MatDialogRef<CreateComponent>,
    public taskService: TaskService,
    private taskDraftService: TaskDraftService,
    @Inject(MAT_DIALOG_DATA) public data: number | TaskFormContext | null,
    @Optional() private dialog: MatDialog | null = null
  ) { }

  ngOnInit(): void {
    this.taskId = typeof this.data === 'number' ? this.data : this.data?.taskId ?? 0;
    this.parentId = typeof this.data === 'object' && this.data ? this.data.parentId : undefined;
    this.setTitle();
    const draft = this.taskDraftService.read(this.taskId, this.parentId);
    if (draft && draft.taskId === this.taskId && draft.parentId === this.parentId) {
      this.taskForm.setValue({ title: draft.title, description: draft.description,
        dueDate: draft.dueDate ? this.parseDate(draft.dueDate) : null, status: draft.status });
      this.taskForm.markAsDirty();
    }
    if (this.taskId) this.getTaskDetail();
    else if (this.parentId) this.loadParent();
    else { this.detailReady = true; this.persistDraft(); }
    this.subscriptions.add(this.taskForm.valueChanges.subscribe(() => { this.notice = ''; this.persistDraft(); }));
  }

  private setTitle(): void {
    this.dialogTitle = this.parentId ? (this.taskId ? `Edit subtask #${this.taskId}` : 'New subtask')
      : this.taskId ? `Edit task #${this.taskId}` : 'New Task';
  }

  private parseDate(value: string): Date {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value);
  }

  private dateValue(value: Date | null): string {
    if (!value || !Number.isFinite(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  get canSave(): boolean { return this.detailReady && !this.loading && !this.saving && this.taskForm.valid; }

  get maxDueDate(): Date | null { return this.parentTask ? this.parseDate(this.parentTask.dueDate) : null; }
  get parentDateUnsaved(): boolean { return this.dateValue(this.taskForm.controls.dueDate.value) !== this.savedDueDate; }
  get canManageSubtasks(): boolean { return this.detailReady && !this.loading && !this.saving && !this.parentDateUnsaved; }

  private persistDraft(): void {
    const value = this.taskForm.getRawValue();
    const date = value.dueDate;
    this.taskDraftService.write({ ...value, taskId: this.taskId,
      ...(this.parentId ? { parentId: this.parentId } : {}),
      dueDate: date && Number.isFinite(date.getTime()) ? date.toISOString() : null });
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }

  onCancelClick(): void {
    this.taskDraftService.clear(this.taskId, this.parentId);
    this.dialogRef.close(this.changed);
  }

  getTaskDetail(): void {
    this.loading = true;
    this.subscriptions.add(this.taskService.find(this.taskId).subscribe({
      next: (task: Task) => {
        this.children = task.subtasks ?? [];
        this.savedDueDate = task.dueDate.slice(0, 10);
        this.parentId = task.parentId ?? this.parentId;
        this.setTitle();
        if (!this.taskForm.dirty) this.taskForm.setValue({ title: task.title, description: task.description,
          dueDate: this.parseDate(task.dueDate), status: task.status }, { emitEvent: false });
        this.loading = false;
        this.detailReady = true;
        if (this.parentId) this.loadParent();
        this.persistDraft();
      },
      error: err => { this.loading = false; this.showError(err); }
    }));
  }

  private loadParent(): void {
    if (!this.parentId) return;
    this.loading = true;
    this.subscriptions.add(this.taskService.find(this.parentId).subscribe({
      next: (parent: Task) => {
        this.parentTask = parent;
        this.detailReady = true;
        this.loading = false;
        if (!this.taskId && !this.taskForm.dirty) this.taskForm.patchValue({
          dueDate: this.parseDate(parent.dueDate), status: 'PENDING'
        });
        this.taskForm.controls.dueDate.updateValueAndValidity();
        this.persistDraft();
      },
      error: err => { this.loading = false; this.detailReady = false; this.showError(err); }
    }));
  }

  openSubtask(child?: Task): void {
    if (!this.dialog || !this.canManageSubtasks) return;
    this.persistDraft();
    const ref = this.dialog.open(CreateComponent, { width: '600px', disableClose: true,
      data: { taskId: child!.id, parentId: this.taskId } });
    this.subscriptions.add(ref.afterClosed().subscribe(saved => {
      if (saved) { this.changed = true; this.getTaskDetail(); }
      this.persistDraft();
    }));
  }

  deleteSubtask(child: Task): void {
    if (!this.dialog || this.loading || this.saving) return;
    const ref = this.dialog.open(ConfirmDialogComponent, { width: '420px',
      data: { message: `Delete subtask “${child.title}”? The parent and other subtasks will remain.`, confirmLabel: 'Delete subtask' } });
    this.subscriptions.add(ref.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.saving = true;
      this.subscriptions.add(this.taskService.delete(child.id).subscribe({
        next: () => { this.saving = false; this.changed = true;
          this.taskDraftService.clear(child.id, this.taskId); this.getTaskDetail(); },
        error: err => { this.saving = false; this.showError(err); }
      }));
    }));
  }

  private showError(err: any): void {
    console.error(err);
    this.globalError = err?.error?.message || err?.message || 'Unable to save changes. Please try again.';
  }

  onSaveClick(): void {
    if (!this.canSave) return;
    this.globalError = '';
    const dueDate = this.dateValue(this.taskForm.controls.dueDate.value);
    if (this.parentTask && dueDate > this.parentTask.dueDate.slice(0, 10)) {
      this.globalError = `Subtask due date must be ${this.parentTask.dueDate.slice(0, 10)} or earlier.`;
      return;
    }
    const blocking = this.children.filter(c => c.dueDate.slice(0, 10) > dueDate);
    if (blocking.length) {
      this.globalError = 'Update the due date of ' + blocking.map(c => `“${c.title}” (#${c.id}, ${c.dueDate.slice(0, 10)})`).join(', ')
        + ` to ${dueDate} or earlier before saving this parent due date.`;
      return;
    }
    const payload = { ...this.taskForm.getRawValue(), dueDate };
    const result: Observable<any> = this.taskId ? this.taskService.update({ ...payload, id: this.taskId })
      : this.parentId ? this.taskService.createSubtask(this.parentId, payload) : this.taskService.create(payload);
    this.saving = true;
    this.subscriptions.add(result.subscribe({
      next: (task: Task) => {
        this.saving = false;
        if (!task.id) { this.globalError = 'Unable to save changes.'; return; }
        this.taskDraftService.clear(this.taskId, this.parentId);
        this.changed = true;
        if (this.taskId && !this.parentId) {
          this.savedDueDate = task.dueDate.slice(0, 10);
          this.taskForm.markAsPristine();
          this.notice = 'Task changes saved.';
        } else this.dialogRef.close(true);
      },
      error: err => { this.saving = false; this.showError(err); }
    }));
  }
}
