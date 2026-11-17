export interface TaskDraft {
  taskId: number;
  parentId?: number;
  title: string | null;
  description: string | null;
  dueDate: string | null;
  status: string | null;
}
