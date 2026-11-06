import { supabase } from '@/lib/supabase';
import type { TaskStatus } from '@/lib/database.types';
import { unwrap } from '@/api/result';

export interface TaskStatusRow {
  readonly site_id: number;
  readonly status: TaskStatus;
}

/**
 * Read-only: site/status pairs for the site list counters.
 * RLS filters rows per user (assignees see only their own tasks; archived tasks are hidden).
 */
export async function fetchTaskStatusRows(): Promise<TaskStatusRow[]> {
  return unwrap(await supabase.from('tasks').select('site_id, status'));
}
