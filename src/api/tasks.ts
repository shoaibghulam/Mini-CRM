import { supabase } from '@/lib/supabase';
import type { TaskRow, TaskStatus } from '@/lib/database.types';
import { requireAffected, unwrap } from '@/api/result';

const COLUMNS = 'id, site_id, assignee_id, author_id, title, description, status, created_at';

/** Only the columns the DB grants for INSERT/UPDATE. status/author are set by the DB. */
export interface TaskInput {
  site_id: number;
  assignee_id: string;
  title: string;
  description: string;
}

export async function fetchTasksBySite(siteId: number): Promise<TaskRow[]> {
  return unwrap(
    await supabase.from('tasks').select(COLUMNS).eq('site_id', siteId).order('created_at', { ascending: false })
  );
}

/** The explicit filter is for clarity; RLS already limits an assignee to own tasks. */
export async function fetchTasksByAssignee(assigneeId: string): Promise<TaskRow[]> {
  return unwrap(
    await supabase
      .from('tasks')
      .select(COLUMNS)
      .eq('assignee_id', assigneeId)
      .order('created_at', { ascending: false })
  );
}

export async function fetchTask(id: number): Promise<TaskRow | null> {
  const { data, error } = await supabase.from('tasks').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createTask(input: TaskInput): Promise<TaskRow> {
  return unwrap(await supabase.from('tasks').insert(input).select(COLUMNS).single());
}

export async function updateTask(id: number, input: TaskInput): Promise<TaskRow> {
  return requireAffected(unwrap(await supabase.from('tasks').update(input).eq('id', id).select(COLUMNS)));
}

/** Soft delete: the RPC archives the task (manager only); its status history is kept. */
export async function deleteTask(id: number): Promise<void> {
  const { error } = await supabase.rpc('delete_task', { p_task_id: id });
  if (error) throw error;
}

/** The only way to change a status. The RPC validates everything server-side. */
export async function changeTaskStatus(
  taskId: number,
  newStatus: TaskStatus,
  comment: string | null
): Promise<TaskRow> {
  return unwrap(
    await supabase.rpc('change_task_status', {
      p_task_id: taskId,
      p_new_status: newStatus,
      p_comment: comment,
    })
  );
}
