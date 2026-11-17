import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { of, Subject, throwError } from 'rxjs';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { CreateComponent } from './create.component';
import { TaskService } from '../task.service';
import { TaskDraftService } from '../task-draft.service';

describe('Task draft restoration', () => {
  let taskDraftService: TaskDraftService;
  let tasks: jasmine.SpyObj<TaskService>;
  let dialog: jasmine.SpyObj<MatDialogRef<CreateComponent>>;
  let component: CreateComponent;

  beforeEach(() => {
    taskDraftService = new TaskDraftService();
    taskDraftService.clear();
    tasks = jasmine.createSpyObj('TaskService', ['find', 'create', 'update']);
    tasks.find.and.returnValue(of({ id: 7, title: 'Saved title', description: '',
      dueDate: '2026-11-16T06:00:00.000Z', status: 'PENDING' }));
    dialog = jasmine.createSpyObj('MatDialogRef', ['close']);
  });

  afterEach(() => {
    component?.ngOnDestroy();
    taskDraftService.clear();
  });

  it('restores every edited field after the component is recreated without changing the saved task', () => {
    component = new CreateComponent(dialog, tasks, taskDraftService, 7);
    component.ngOnInit();
    const values = { title: 'Draft title', description: 'Draft description',
      dueDate: new Date('2026-12-20T06:00:00.000Z'), status: 'COMPLETED' };
    component.taskForm.setValue(values);
    component.ngOnDestroy();
    component = new CreateComponent(dialog, tasks, taskDraftService, 7);
    component.ngOnInit();
    expect(component.taskForm.getRawValue()).toEqual(values);
    expect(tasks.find).toHaveBeenCalledTimes(2);
    expect(tasks.update).not.toHaveBeenCalled();
  });

  it('does not overwrite typing when the initial task response arrives late', () => {
    const response = new Subject<any>();
    tasks.find.and.returnValue(response);
    component = new CreateComponent(dialog, tasks, taskDraftService, 7);
    component.ngOnInit();
    component.taskForm.controls.title.setValue('Typing while loading');
    component.taskForm.markAsDirty();
    response.next({ id: 7, title: 'Old saved title', description: '', dueDate: '2026-11-16', status: 'PENDING' });
    expect(component.taskForm.controls.title.value).toBe('Typing while loading');
    expect(taskDraftService.read()?.title).toBe('Typing while loading');
  });

  it('preserves incomplete new task drafts', () => {
    component = new CreateComponent(dialog, tasks, taskDraftService, 0);
    component.ngOnInit();
    component.taskForm.controls.title.setValue('Partially typed');
    component.ngOnDestroy();
    component = new CreateComponent(dialog, tasks, taskDraftService, 0);
    component.ngOnInit();
    expect(component.taskForm.controls.title.value).toBe('Partially typed');
    expect(component.taskForm.invalid).toBeTrue();
  });

  it('clears the draft on Cancel', () => {
    component = new CreateComponent(dialog, tasks, taskDraftService, 0);
    component.ngOnInit();
    component.onCancelClick();
    expect(taskDraftService.read()).toBeNull();
    expect(dialog.close).toHaveBeenCalledWith(false);
  });

  it('keeps the draft after a failed Save and clears it after a successful Save', () => {
    component = new CreateComponent(dialog, tasks, taskDraftService, 7);
    component.ngOnInit();
    component.taskForm.controls.title.setValue('Edited');
    const errorLog = spyOn(console, 'error');
    tasks.update.and.returnValue(throwError(() => new Error('Network unavailable')));
    component.onSaveClick();
    expect(errorLog).toHaveBeenCalledWith(jasmine.any(Error));
    expect(taskDraftService.read()?.title).toBe('Edited');
    expect(dialog.close).not.toHaveBeenCalled();
    tasks.update.and.returnValue(of({ id: 7, dueDate: '2026-11-16' }));
    component.onSaveClick();
    expect(taskDraftService.read()).toBeNull();
    expect(component.notice).toBe('Task changes saved.');
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('ignores malformed storage', () => {
    spyOn(Storage.prototype, 'getItem').and.returnValue('{bad JSON');
    expect(taskDraftService.read()).toBeNull();
  });

  it('rejects invalid stored dates', () => {
    spyOn(Storage.prototype, 'getItem').and.returnValue(JSON.stringify({
      taskId: 7, title: '', description: '', dueDate: 'invalid', status: 'PENDING'
    }));
    expect(taskDraftService.read()).toBeNull();
  });

  it('allows editing when storage is unavailable', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('Blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('Blocked');
    spyOn(Storage.prototype, 'removeItem').and.throwError('Blocked');
    component = new CreateComponent(dialog, tasks, taskDraftService, 0);
    component.ngOnInit();
    expect(() => component.taskForm.controls.title.setValue('Still editable')).not.toThrow();
    expect(() => component.onCancelClick()).not.toThrow();
  });
});


describe('CreateComponent title validation', () => {
  let taskDraftService: jasmine.SpyObj<TaskDraftService>;
  let tasks: jasmine.SpyObj<TaskService>;

  beforeEach(async () => {
    taskDraftService = jasmine.createSpyObj('TaskDraftService', ['read', 'write', 'clear']);
    taskDraftService.read.and.returnValue(null);
    tasks = jasmine.createSpyObj('TaskService', ['find', 'create', 'update']);
    await TestBed.configureTestingModule({
      imports: [CreateComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: null },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: TaskService, useValue: tasks },
        { provide: TaskDraftService, useValue: taskDraftService }
      ]
    }).compileComponents();
  });

  it('rejects spaces, tabs, newlines, and Unicode whitespace while allowing meaningful titles', () => {
    const fixture = TestBed.createComponent(CreateComponent);
    fixture.detectChanges();
    const title = fixture.componentInstance.taskForm.controls.title;
    for (const value of [' ', '   ', '\t', '\n', '\u00a0', ' \t\n ']) {
      title.setValue(value);
      expect(title.hasError('pattern')).withContext(JSON.stringify(value)).toBeTrue();
    }
    for (const value of ['Task', '  Task  ', 'Task title', '1', '!']) {
      title.setValue(value);
      expect(title.valid).withContext(value).toBeTrue();
    }
    title.setValue('');
    expect(title.hasError('required')).toBeTrue();
    title.setValue(null);
    expect(title.hasError('required')).toBeTrue();
  });

  it('shows an informative error after blur, blocks Save, and clears the error when corrected', () => {
    const fixture = TestBed.createComponent(CreateComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.taskForm.patchValue({ dueDate: new Date(2026, 11, 20), status: 'PENDING' });
    const element: HTMLElement = fixture.nativeElement;
    const input = element.querySelector<HTMLInputElement>('input[formControlName="title"]')!;
    input.dispatchEvent(new Event('focus'));
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.taskForm.controls.title.touched).toBeFalse();
    expect(element.textContent).not.toContain('Title cannot contain only whitespace');

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(component.taskForm.controls.title.touched).toBeTrue();
    expect(element.textContent).toContain('Title cannot contain only whitespace. Enter at least one non-whitespace character.');
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
    component.onSaveClick();
    expect(tasks.create).not.toHaveBeenCalled();
    expect(tasks.update).not.toHaveBeenCalled();
    // Drafts continue to retain input immediately, even before blur or successful validation.
    expect(taskDraftService.write).toHaveBeenCalledWith(jasmine.objectContaining({ title: '   ' }));

    input.value = '  Valid task  ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Title cannot contain only whitespace');
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeFalse();
  });
});

describe('Subtask editing', () => {
  let tasks: jasmine.SpyObj<TaskService>;
  let drafts: TaskDraftService;
  let ref: jasmine.SpyObj<MatDialogRef<CreateComponent>>;
  let component: CreateComponent;

  beforeEach(() => {
    tasks = jasmine.createSpyObj('TaskService', ['find', 'create', 'createSubtask', 'update', 'delete']);
    tasks.find.and.returnValue(of({ id: 12, title: 'Parent', description: '', dueDate: '2026-12-04',
      status: 'PENDING', parentId: null, subtasks: [
        { id: 13, title: 'Review release notes', dueDate: '2026-12-04', status: 'PENDING', parentId: 12 }
      ] }));
    drafts = new TaskDraftService();
    drafts.clear();
    ref = jasmine.createSpyObj('MatDialogRef', ['close']);
  });
  afterEach(() => { component?.ngOnDestroy(); drafts.clear(); });

  it('defaults a child date from its saved parent and sends creation to the child API', () => {
    component = new CreateComponent(ref, tasks, drafts, { parentId: 12 });
    component.ngOnInit();
    expect(component.taskForm.controls.dueDate.value).toEqual(new Date(2026, 11, 4));
    expect(component.maxDueDate).toEqual(new Date(2026, 11, 4));
    component.taskForm.controls.title.setValue('New child');
    tasks.createSubtask.and.returnValue(of({ id: 14, title: 'New child', description: '', dueDate: '2026-12-04', status: 'PENDING', parentId: 12 }));
    component.onSaveClick();
    expect(tasks.createSubtask).toHaveBeenCalledWith(12, jasmine.objectContaining({ title: 'New child', dueDate: '2026-12-04' }));
    expect(tasks.create).not.toHaveBeenCalled();
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('rejects later child dates even before Material input validation', () => {
    component = new CreateComponent(ref, tasks, drafts, { parentId: 12 });
    component.ngOnInit();
    component.taskForm.patchValue({ title: 'Late child', dueDate: new Date(2026, 11, 5) });
    component.onSaveClick();
    expect(component.globalError).toContain('2026-12-04 or earlier');
    expect(tasks.createSubtask).not.toHaveBeenCalled();
  });

  it('names the child blocking an earlier parent date and requires saving before managing children', () => {
    component = new CreateComponent(ref, tasks, drafts, 12);
    component.ngOnInit();
    expect(component.canManageSubtasks).toBeTrue();
    component.taskForm.controls.dueDate.setValue(new Date(2026, 11, 3));
    expect(component.canManageSubtasks).toBeFalse();
    component.onSaveClick();
    expect(component.globalError).toContain('Review release notes');
    expect(component.globalError).toContain('2026-12-03 or earlier');
    expect(tasks.update).not.toHaveBeenCalled();
  });

  it('deletes a child only after confirmation and refreshes the parent detail', () => {
    const dialogs = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    dialogs.open.and.returnValue({ afterClosed: () => of(false) } as any);
    component = new CreateComponent(ref, tasks, drafts, 12, dialogs);
    component.ngOnInit();
    const child = component.children[0];
    component.deleteSubtask(child);
    expect(tasks.delete).not.toHaveBeenCalled();
    expect(dialogs.open).toHaveBeenCalledWith(jasmine.anything(), jasmine.objectContaining({
      data: jasmine.objectContaining({ message: jasmine.stringContaining('Review release notes') })
    }));
    dialogs.open.and.returnValue({ afterClosed: () => of(true) } as any);
    tasks.delete.and.returnValue(of(null));
    component.deleteSubtask(child);
    expect(tasks.delete).toHaveBeenCalledWith(13);
    expect(tasks.find).toHaveBeenCalledTimes(2);
    expect(component.changed).toBeTrue();
  });

  it('preserves parent and child drafts independently', () => {
    drafts.write({ taskId: 12, title: 'Unsaved parent', description: '', dueDate: null, status: 'PENDING' });
    component = new CreateComponent(ref, tasks, drafts, { parentId: 12 });
    component.ngOnInit();
    component.taskForm.controls.title.setValue('Child draft');
    expect(drafts.read()?.parentId).toBe(12);
    expect(drafts.read(12)?.title).toBe('Unsaved parent');
    component.onCancelClick();
    expect(drafts.read(0, 12)).toBeNull();
    expect(drafts.read(12)?.title).toBe('Unsaved parent');
    drafts.clearFamily(12);
    expect(drafts.read()).toBeNull();
  });
});

describe('Subtask form rendering', () => {
  it('shows parent context, enforces the picker maximum, and hides recursive creation', async () => {
    const tasks = jasmine.createSpyObj<TaskService>('TaskService', ['find', 'createSubtask']);
    tasks.find.and.returnValue(of({ id: 12, title: 'Prepare release', description: '', dueDate: '2026-12-04', status: 'PENDING', subtasks: [] }));
    const drafts = new TaskDraftService();
    drafts.clear();
    await TestBed.configureTestingModule({
      imports: [CreateComponent],
      providers: [provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { parentId: 12 } },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: TaskService, useValue: tasks },
        { provide: TaskDraftService, useValue: drafts }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(CreateComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Prepare release');
    expect(element.querySelector('section[aria-label="Subtasks"]')).toBeNull();
    component.taskForm.controls.title.setValue('Review notes');
    component.taskForm.controls.dueDate.setValue(new Date(2026, 11, 5));
    component.taskForm.controls.dueDate.markAsTouched();
    fixture.detectChanges();
    expect(component.taskForm.controls.dueDate.hasError('matDatepickerMax')).toBeTrue();
    expect(element.textContent).toContain('Subtask due date cannot be after the parent due date.');
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
    fixture.destroy();
    drafts.clear();
  });
});
