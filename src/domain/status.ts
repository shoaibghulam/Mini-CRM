import type { TaskStatus, UserRole } from '@/lib/database.types';

export const STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  new: 'Новая',
  in_progress: 'В работе',
  under_review: 'На проверке',
  accepted: 'Принята',
  needs_rework: 'На доработке',
};

/** Workflow order, used for sorting task lists. */
export const STATUS_ORDER: readonly TaskStatus[] = [
  'new',
  'in_progress',
  'needs_rework',
  'under_review',
  'accepted',
];

export const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  manager: 'Постановщик',
  assignee: 'Исполнитель',
};

export interface Transition {
  readonly from: TaskStatus;
  readonly to: TaskStatus;
  readonly actor: UserRole;
  readonly commentRequired: boolean;
  readonly label: string;
}

/**
 * Mirror of the `public.task_transitions` table (docs/03 §1). The DB copy is
 * authoritative; this one only decides which buttons to render.
 */
export const TRANSITIONS: readonly Transition[] = [
  { from: 'new', to: 'in_progress', actor: 'assignee', commentRequired: false, label: 'Взять в работу' },
  { from: 'in_progress', to: 'under_review', actor: 'assignee', commentRequired: false, label: 'Отправить на проверку' },
  { from: 'under_review', to: 'accepted', actor: 'manager', commentRequired: false, label: 'Принять' },
  { from: 'under_review', to: 'needs_rework', actor: 'manager', commentRequired: true, label: 'Вернуть на доработку' },
  { from: 'needs_rework', to: 'in_progress', actor: 'assignee', commentRequired: false, label: 'Вернуться к работе' },
];

export function statusLabel(status: TaskStatus | null): string {
  return status === null ? '—' : STATUS_LABELS[status];
}

export function compareByStatus(a: TaskStatus, b: TaskStatus): number {
  return STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b);
}
