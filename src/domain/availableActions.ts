import type { TaskStatus, UserRole } from '@/lib/database.types';
import { TRANSITIONS, type Transition } from '@/domain/status';

export type TaskAction = Transition;

export interface ActionableTask {
  readonly status: TaskStatus;
  readonly assignee_id: string;
}

/**
 * Which status actions the current user may take on a task.
 *
 * UI only. The DB is the real gate: `change_task_status` (SECURITY DEFINER RPC)
 * re-checks role, ownership, the transition table and the comment rule, and
 * RLS + column grants block every other write path. This function just avoids
 * showing buttons that the DB would reject.
 */
export function availableActions(
  role: UserRole,
  userId: string,
  task: ActionableTask
): readonly TaskAction[] {
  if (role === 'assignee' && task.assignee_id !== userId) return [];
  return TRANSITIONS.filter((t) => t.from === task.status && t.actor === role);
}
