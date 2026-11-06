import type { TaskStatus, TaskStatusHistoryRow, UserRole } from '@/lib/database.types';

/**
 * Explains whose move it is when the current user has no status action.
 * Pure UI copy: availableActions() decides which buttons exist.
 */
export function waitingHint(status: TaskStatus, role: UserRole): string {
  if (status === 'accepted') return 'Задача принята — работа завершена.';
  if (status === 'under_review') {
    return role === 'manager' ? 'Задача ждёт вашей проверки.' : 'Работа отправлена на проверку. Ждём решения постановщика.';
  }
  if (role === 'manager') {
    if (status === 'needs_rework') return 'Задача возвращена исполнителю на доработку.';
    if (status === 'new') return 'Исполнитель ещё не взял задачу в работу.';
    return 'Исполнитель выполняет задачу.';
  }
  return 'Сейчас действий по задаче нет.';
}

/** The comment of the most recent move to "needs_rework", if the task is in that status. */
export function latestReworkComment(
  status: TaskStatus,
  history: readonly Pick<TaskStatusHistoryRow, 'to_status' | 'comment'>[],
): string | null {
  if (status !== 'needs_rework') return null;
  const last = [...history].reverse().find((row) => row.to_status === 'needs_rework');
  return last?.comment ?? null;
}
