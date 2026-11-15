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
