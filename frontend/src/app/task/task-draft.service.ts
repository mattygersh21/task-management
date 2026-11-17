import { Injectable } from '@angular/core';
import { TaskDraft } from '../models/task-draft';

interface DraftStore { active: string; drafts: Record<string, TaskDraft>; }

@Injectable({ providedIn: 'root' })
export class TaskDraftService {
  private readonly key = 'task-management.drafts.v2';
  private context(taskId: number, parentId?: number): string { return `${parentId ?? 'root'}:${taskId}`; }

  private valid(draft: any): draft is TaskDraft {
    return draft && Number.isSafeInteger(draft.taskId) && draft.taskId >= 0 &&
      (draft.parentId === undefined || (Number.isSafeInteger(draft.parentId) && draft.parentId > 0)) &&
      [draft.title, draft.description].every(value => value === null || typeof value === 'string') &&
      [null, '', 'PENDING', 'COMPLETED'].includes(draft.status) &&
      (draft.dueDate === null || (typeof draft.dueDate === 'string' && Number.isFinite(new Date(draft.dueDate).getTime())));
  }

  private store(): DraftStore {
    const empty = { active: '', drafts: {} };
    try {
      const raw = sessionStorage.getItem(this.key);
      if (!raw) {
        const legacy = JSON.parse(sessionStorage.getItem('task-management.draft.v1') || 'null');
        if (this.valid(legacy)) {
          const key = this.context(legacy.taskId, legacy.parentId);
          return { active: key, drafts: { [key]: legacy } };
        }
        return empty;
      }
      const store = JSON.parse(raw);
      if (!store || typeof store.active !== 'string' || !store.drafts ||
          !Object.entries(store.drafts).every(([key, draft]) => this.valid(draft) && key === this.context(draft.taskId, draft.parentId))) return empty;
      return store;
    } catch { return empty; }
  }

  read(taskId?: number, parentId?: number): TaskDraft | null {
    const store = this.store();
    return store.drafts[taskId === undefined ? store.active : this.context(taskId, parentId)] ?? null;
  }

  write(draft: TaskDraft): void {
    try {
      const store = this.store();
      store.active = this.context(draft.taskId, draft.parentId);
      store.drafts[store.active] = draft;
      sessionStorage.setItem(this.key, JSON.stringify(store));
      sessionStorage.removeItem('task-management.draft.v1');
    } catch { /* Editing remains available if browser storage is unavailable. */ }
  }

  clearFamily(parentId: number): void {
    try {
      const store = this.store();
      for (const [key, draft] of Object.entries(store.drafts)) {
        if (draft.taskId === parentId || draft.parentId === parentId) delete store.drafts[key];
      }
      if (!store.drafts[store.active]) store.active = Object.keys(store.drafts).at(-1) ?? '';
      sessionStorage.setItem(this.key, JSON.stringify(store));
      sessionStorage.removeItem('task-management.draft.v1');
    } catch { /* Storage may be blocked. */ }
  }

  clear(taskId?: number, parentId?: number): void {
    try {
      if (taskId === undefined) {
        sessionStorage.removeItem(this.key);
      } else {
        const store = this.store();
        delete store.drafts[this.context(taskId, parentId)];
        if (!store.drafts[store.active]) store.active = Object.keys(store.drafts).at(-1) ?? '';
        sessionStorage.setItem(this.key, JSON.stringify(store));
      }
      sessionStorage.removeItem('task-management.draft.v1');
    } catch { /* Storage may be blocked. */ }
  }
}
