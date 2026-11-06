import { useCallback } from 'react';
import { fetchAssignees } from '@/api/profiles';
import { fetchSites } from '@/api/sites';
import type { TaskFormOptions } from '@/components/TaskFormModal';
import { useAsyncData, type AsyncData } from '@/hooks/useAsyncData';

const EMPTY: TaskFormOptions = { assignees: [], sites: [] };

/** Dropdown data for the task form. Loaded only for managers (assignees cannot edit tasks). */
export function useTaskFormOptions(
  enabled: boolean,
): readonly [TaskFormOptions, AsyncData<TaskFormOptions>, () => void] {
  const loader = useCallback(async (): Promise<TaskFormOptions> => {
    if (!enabled) return EMPTY;
    const [assignees, sites] = await Promise.all([fetchAssignees(), fetchSites()]);
    return { assignees, sites };
  }, [enabled]);
  const [state, reload] = useAsyncData(loader);
  return [state.status === 'success' ? state.data : EMPTY, state, reload] as const;
}
