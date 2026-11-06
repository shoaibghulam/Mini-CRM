import { describe, it, expect } from 'vitest';
import type { TaskStatus, UserRole } from '@/lib/database.types';
import { availableActions } from '@/domain/availableActions';

const ME = 'user-me';
const OTHER = 'user-other';

const targets = (role: UserRole, userId: string, status: TaskStatus, assigneeId = ME) =>
  availableActions(role, userId, { status, assignee_id: assigneeId }).map((a) => a.to);

describe('availableActions — every role x status', () => {
  const cases: ReadonlyArray<readonly [UserRole, TaskStatus, readonly TaskStatus[]]> = [
    ['assignee', 'new', ['in_progress']],
    ['assignee', 'in_progress', ['under_review']],
    ['assignee', 'under_review', []],
    ['assignee', 'accepted', []],
    ['assignee', 'needs_rework', ['in_progress']],
    ['manager', 'new', []],
    ['manager', 'in_progress', []],
    ['manager', 'under_review', ['accepted', 'needs_rework']],
    ['manager', 'accepted', []],
    ['manager', 'needs_rework', []],
  ];

  it.each(cases)('%s on %s -> %j', (role, status, expected) => {
    const userId = role === 'manager' ? 'manager-1' : ME;
    expect(targets(role, userId, status)).toEqual(expected);
  });
});

describe('availableActions — ownership', () => {
  const statuses: readonly TaskStatus[] = ['new', 'in_progress', 'under_review', 'accepted', 'needs_rework'];

  it.each(statuses)('assignee gets nothing on someone else\'s task in %s', (status) => {
    expect(targets('assignee', ME, status, OTHER)).toEqual([]);
  });

  it.each(statuses)('manager actions in %s do not depend on who the assignee is', (status) => {
    expect(targets('manager', 'manager-1', status, OTHER)).toEqual(targets('manager', 'manager-1', status, ME));
  });

  it.each<UserRole>(['manager', 'assignee'])('%s cannot act on an accepted task', (role) => {
    expect(targets(role, ME, 'accepted', ME)).toEqual([]);
  });
});

describe('availableActions — comment rule', () => {
  it('only rework requires a comment', () => {
    const actions = availableActions('manager', 'm', { status: 'under_review', assignee_id: ME });
    const required = actions.filter((a) => a.commentRequired).map((a) => a.to);
    expect(required).toEqual(['needs_rework']);
  });
});
