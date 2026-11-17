export interface Task {
  id: number;
  title: string;
  description: string | null;
  dueDate: string;
  status: string;
  parentId?: number | null;
  subtasks?: Task[];
}

export interface TaskFormContext {
  taskId?: number;
  parentId?: number;
}
