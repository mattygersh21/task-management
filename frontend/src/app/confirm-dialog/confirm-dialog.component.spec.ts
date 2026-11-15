import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let component: ConfirmDialogComponent;
  let fixture: ComponentFixture<ConfirmDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: { message: 'Delete this task?' } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfirmDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should display the supplied confirmation message', () => {
    expect(fixture.nativeElement.textContent).toContain('Delete this task?');
  });

  it('should close with false when Cancel is clicked', () => {
    fixture.nativeElement.querySelector('button').click();
    expect(component.dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should close with true when Yes is clicked', () => {
    fixture.nativeElement.querySelectorAll('button')[1].click();
    expect(component.dialogRef.close).toHaveBeenCalledWith(true);
  });
});
