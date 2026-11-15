import { Injectable } from '@angular/core';

import { TaskDraft } from '../models/task-draft';

@Injectable({ providedIn: 'root' })
export class TaskDraftService {
  private readonly key = 'task-management.draft.v1';

  read(): TaskDraft | null {
    try {
      const raw = sessionStorage.getItem(this.key);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (!draft || !Number.isSafeInteger(draft.taskId) || draft.taskId < 0 ||
          ![draft.title, draft.description].every(value => value === null || typeof value === 'string') ||
          ![null, '', 'PENDING', 'COMPLETED'].includes(draft.status) ||
          !(draft.dueDate === null || (typeof draft.dueDate === 'string' &&
            Number.isFinite(new Date(draft.dueDate).getTime())))) {
        this.clear();
        return null;
      }
      return draft;
    } catch {
      this.clear();
      return null;
    }
  }

  write(draft: TaskDraft): void {
    try {
      sessionStorage.setItem(this.key, JSON.stringify(draft));
    } catch {
      // Editing remains available if browser storage is disabled or full.
    }
  }

  clear(): void {
    try {
      sessionStorage.removeItem(this.key);
    } catch {
      // Browser storage may be disabled.
    }
  }
}
