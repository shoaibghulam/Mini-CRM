import type { TaskStatus } from '@/lib/database.types';
import { STATUS_ORDER } from '@/domain/status';

export type StatusCounts = Readonly<Record<TaskStatus, number>>;

export const EMPTY_COUNTS: StatusCounts = {
  new: 0,
  in_progress: 0,
  under_review: 0,
  accepted: 0,
  needs_rework: 0,
};

/** "What to do next" order for an assignee: returned work first, then new, then ongoing. */
export const ASSIGNEE_FOCUS_ORDER: readonly TaskStatus[] = [
  'needs_rework',
  'new',
  'in_progress',
  'under_review',
  'accepted',
];

/** Statuses where the next move belongs to the assignee. */
export const ASSIGNEE_ACTIONABLE: ReadonlySet<TaskStatus> = new Set(['needs_rework', 'new', 'in_progress']);

export function countByStatus(items: readonly { readonly status: TaskStatus }[]): StatusCounts {
  return items.reduce<StatusCounts>((acc, item) => ({ ...acc, [item.status]: acc[item.status] + 1 }), EMPTY_COUNTS);
}

export function totalOf(counts: StatusCounts): number {
  return STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);
}

interface SiteStatusRow {
  readonly site_id: number;
  readonly status: TaskStatus;
}

/** site id -> counts. Sites without tasks are simply absent. */
export function countsBySite(rows: readonly SiteStatusRow[]): ReadonlyMap<number, StatusCounts> {
  const grouped = new Map<number, SiteStatusRow[]>();
  for (const row of rows) grouped.set(row.site_id, [...(grouped.get(row.site_id) ?? []), row]);
  return new Map([...grouped].map(([siteId, list]) => [siteId, countByStatus(list)]));
}

export interface StatusGroup<T> {
  readonly status: TaskStatus;
  readonly items: readonly T[];
}

/** Non-empty groups in the given order; item order inside a group is preserved. */
export function groupByStatus<T extends { readonly status: TaskStatus }>(
  items: readonly T[],
  order: readonly TaskStatus[],
): readonly StatusGroup<T>[] {
  return order
    .map((status) => ({ status, items: items.filter((item) => item.status === status) }))
    .filter((group) => group.items.length > 0);
}
