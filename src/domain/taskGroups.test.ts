import type { TaskStatus } from '@/lib/database.types';
import {
  ASSIGNEE_FOCUS_ORDER,
  EMPTY_COUNTS,
  countByStatus,
  countsBySite,
  groupByStatus,
  totalOf,
} from '@/domain/taskGroups';

const t = (id: number, status: TaskStatus, site_id = 1) => ({ id, status, site_id });

describe('countByStatus', () => {
  it('returns zero for every status on an empty list', () => {
    expect(countByStatus([])).toEqual(EMPTY_COUNTS);
  });

  it('counts each status independently', () => {
    const counts = countByStatus([t(1, 'new'), t(2, 'new'), t(3, 'accepted')]);
    expect(counts).toEqual({ ...EMPTY_COUNTS, new: 2, accepted: 1 });
  });

  it('does not mutate the shared empty object', () => {
    countByStatus([t(1, 'new')]);
    expect(EMPTY_COUNTS.new).toBe(0);
  });
});

describe('totalOf', () => {
  it('sums all statuses', () => {
    expect(totalOf({ ...EMPTY_COUNTS, new: 2, under_review: 3 })).toBe(5);
  });
});

describe('countsBySite', () => {
  it('groups counts per site and omits sites without rows', () => {
    const map = countsBySite([t(1, 'new', 10), t(2, 'accepted', 10), t(3, 'new', 20)]);
    expect(map.get(10)).toEqual({ ...EMPTY_COUNTS, new: 1, accepted: 1 });
    expect(map.get(20)).toEqual({ ...EMPTY_COUNTS, new: 1 });
    expect(map.has(30)).toBe(false);
  });
});

describe('groupByStatus', () => {
  it('follows the given order, drops empty groups and keeps item order', () => {
    const items = [t(1, 'accepted'), t(2, 'new'), t(3, 'needs_rework'), t(4, 'new')];
    const groups = groupByStatus(items, ASSIGNEE_FOCUS_ORDER);
    expect(groups.map((g) => g.status)).toEqual(['needs_rework', 'new', 'accepted']);
    expect(groups[1]?.items.map((i) => i.id)).toEqual([2, 4]);
  });

  it('returns an empty list for no items', () => {
    expect(groupByStatus([], ASSIGNEE_FOCUS_ORDER)).toEqual([]);
  });
});
