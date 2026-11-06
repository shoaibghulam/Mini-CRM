import { supabase } from '@/lib/supabase';
import type { TaskStatusHistoryRow } from '@/lib/database.types';
import { unwrap } from '@/api/result';

/** Read-only: clients have no write grant on history. */
export async function fetchTaskHistory(taskId: number): Promise<TaskStatusHistoryRow[]> {
  return unwrap(
    await supabase
      .from('task_status_history')
      .select('id, task_id, actor_id, from_status, to_status, comment, created_at')
      .eq('task_id', taskId)
      .order('id', { ascending: true })
  );
}
