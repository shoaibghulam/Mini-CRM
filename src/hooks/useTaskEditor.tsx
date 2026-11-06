import { useEffect, useState, type ReactNode } from 'react';
import type { TaskRow } from '@/lib/database.types';
import { createTask, deleteTask, updateTask, type TaskInput } from '@/api/tasks';
import { TaskFormModal } from '@/components/TaskFormModal';
import { useTaskFormOptions } from '@/hooks/useTaskFormOptions';
import { attempt, notifyError } from '@/lib/notify';
import { confirmRemoval } from '@/lib/confirm';

interface TaskEditor {
  readonly openCreate: () => void;
  readonly openEdit: (task: TaskRow) => void;
  readonly remove: (task: TaskRow, onRemoved: () => void) => void;
  readonly modal: ReactNode;
}

/**
 * Manager-side task create/edit/delete, shared by the site card and the task card.
 * Only content columns are sent; the DB forces status/author and guards reassignment.
 */
export function useTaskEditor(enabled: boolean, defaultSiteId: number | null, onSaved: () => void): TaskEditor {
  const [options, optionsState, reloadOptions] = useTaskFormOptions(enabled);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [opened, setOpened] = useState(false);
  const optionsError = optionsState.status === 'error' ? optionsState.message : null;

  // Surface dropdown load failures instead of showing an empty select ("no assignees").
  useEffect(() => {
    if (opened && optionsError) notifyError(new Error(`Не удалось загрузить списки для формы: ${optionsError}`));
  }, [opened, optionsError]);

  const open = (task: TaskRow | null) => {
    setEditing(task);
    reloadOptions(); // fresh assignees/sites every time the form opens
    setOpened(true);
  };

  const save = async (input: TaskInput): Promise<boolean> => {
    const ok = editing
      ? await attempt(() => updateTask(editing.id, input), 'Задача сохранена')
      : await attempt(() => createTask(input), 'Задача создана');
    if (ok) onSaved();
    return ok;
  };

  const remove = (task: TaskRow, onRemoved: () => void) =>
    confirmRemoval('Удалить задачу?', `«${task.title}» исчезнет из списков. История статусов сохранится в базе.`, () => {
      void attempt(() => deleteTask(task.id), 'Задача удалена').then((ok) => ok && onRemoved());
    });

  const modal = enabled ? (
    <TaskFormModal
      opened={opened}
      task={editing}
      defaultSiteId={defaultSiteId}
      options={options}
      onClose={() => setOpened(false)}
      onSubmit={save}
    />
  ) : null;

  return {
    openCreate: () => open(null),
    openEdit: (task) => open(task),
    remove,
    modal,
  };
}
