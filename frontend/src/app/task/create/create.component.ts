import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import {
  MAT_DIALOG_DATA,
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
import { Task } from '../task';
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

  private draftSubscription?: Subscription;
  private detailSubscription?: Subscription;

  taskId: number = 0;
  globalError: string = '';
  descCharLength: number = 256;
  dialogTitle: string = 'New Task';
  statuses: string[] = ['PENDING', 'COMPLETED'];

  taskForm = new FormGroup({
    title: new FormControl('', [Validators.required]),
    description: new FormControl('', [Validators.maxLength(this.descCharLength)]),
    dueDate: new FormControl<Date | null>(null, [Validators.required]),
    status: new FormControl('', [Validators.required])
  });

  constructor(
    public dialogRef: MatDialogRef<CreateComponent>,
    public taskService: TaskService,
    private taskDraftService: TaskDraftService,
    @Inject(MAT_DIALOG_DATA)
    public data: number | null
  ) { }

  ngOnInit(): void {
    if (this.data) {
      this.taskId = this.data;
      this.dialogTitle = `Edit task - Id: ${this.data}`
    }
    const draft = this.taskDraftService.read();
    if (draft && draft.taskId === this.taskId) {
      this.taskForm.setValue({
        title: draft.title,
        description: draft.description,
        dueDate: draft.dueDate ? new Date(draft.dueDate) : null,
        status: draft.status
      });
    } else if (this.taskId) {
      this.getTaskDetail();
    } else {
      this.persistDraft();
    }
    this.draftSubscription = this.taskForm.valueChanges.subscribe(() => this.persistDraft());
  }

  private persistDraft(): void {
    const value = this.taskForm.getRawValue();
    const date = value.dueDate ? new Date(value.dueDate) : null;
    this.taskDraftService.write({
      ...value,
      taskId: this.taskId,
      dueDate: date && Number.isFinite(date.getTime()) ? date.toISOString() : null
    });
  }

  ngOnDestroy(): void {
    this.draftSubscription?.unsubscribe();
    this.detailSubscription?.unsubscribe();
  }

  onCancelClick(): void {
    this.taskDraftService.clear();
    this.dialogRef.close(false);
  }

  getTaskDetail(): void {
    this.detailSubscription = this.taskService.find(this.taskId).subscribe((data: Task) => {
      // A slow response must not overwrite edits made while it was loading.
      if (this.taskForm.dirty) return;
      this.taskForm.setValue({
        description: data.description,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: data.status,
        title: data.title
      }, { emitEvent: false });
      this.persistDraft();
    });
  }

  onSaveClick(): void {
    if (this.taskForm.invalid) {
      return;
    }
    let result: Observable<any>;
    if (this.taskId > 0) {
      result = this.taskService.update({
        ... this.taskForm.value,
        id: this.taskId
      });
    } else {
      result = this.taskService.create(this.taskForm.value);
    }

    result.subscribe({
      next: (res: any) => {
        if (res.id) {
          this.taskDraftService.clear();
          this.dialogRef.close(true);
        } else {
          console.error('Something went wrong!');
          this.globalError = 'Something went wrong!';
        }
      },
      error: (err) => {
        console.error(err);
        this.globalError = 'Something went wrong!';
      }
    });
  }
}