import { of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ListComponent } from './list.component';
import { TaskService } from '../task.service';
import { TaskDraftService } from '../task-draft.service';
import { CreateComponent } from '../create/create.component';

describe('ListComponent draft reopening', () => {
  it('automatically reopens the stored task dialog on page initialization', () => {
    const tasks = jasmine.createSpyObj<TaskService>('TaskService', ['getAll']);
    tasks.getAll.and.returnValue(of([]));
    const taskDraftService = jasmine.createSpyObj<TaskDraftService>('TaskDraftService', ['read']);
    taskDraftService.read.and.returnValue({ taskId: 7, title: 'Draft', description: '',
      dueDate: null, status: 'PENDING' });
    const dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    dialog.open.and.returnValue({ afterClosed: () => of(false) } as any);
    new ListComponent(tasks, taskDraftService, dialog).ngOnInit();
    expect(dialog.open).toHaveBeenCalledWith(CreateComponent,
      { width: '600px', disableClose: true, data: 7 });
  });
});


describe('Parent deletion confirmation', () => {
  it('explicitly warns about all subtasks and deletes only after confirmation', () => {
    const tasks = jasmine.createSpyObj<TaskService>('TaskService', ['delete']);
    tasks.delete.and.returnValue(of(null));
    const drafts = jasmine.createSpyObj<TaskDraftService>('TaskDraftService', ['clearFamily']);
    const dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    dialog.open.and.returnValue({ afterClosed: () => of(false) } as any);
    const component = new ListComponent(tasks, drafts, dialog);
    component.deleteTask(12);
    expect(dialog.open).toHaveBeenCalledWith(jasmine.anything(), jasmine.objectContaining({
      data: jasmine.objectContaining({ message: jasmine.stringContaining('all its subtasks') })
    }));
    expect(tasks.delete).not.toHaveBeenCalled();
    dialog.open.and.returnValue({ afterClosed: () => of(true) } as any);
    component.deleteTask(12);
    expect(tasks.delete).toHaveBeenCalledWith(12);
    expect(drafts.clearFamily).toHaveBeenCalledWith(12);
  });
});
