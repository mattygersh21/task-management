export interface TaskDraft {
  taskId: number;
  title: string | null;
  description: string | null;
  dueDate: string | null;
  status: string | null;
}
