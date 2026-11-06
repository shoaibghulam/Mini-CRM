import { describe, it, expect } from 'vitest';
import type { TaskStatus } from '@/lib/database.types';
import { ROLE_LABELS, STATUS_LABELS, TRANSITIONS, compareByStatus, statusLabel } from '@/domain/status';

describe('status labels', () => {
  it.each<[TaskStatus, string]>([
    ['new', 'Новая'],
    ['in_progress', 'В работе'],
    ['under_review', 'На проверке'],
    ['accepted', 'Принята'],
    ['needs_rework', 'На доработке'],
  ])('%s -> %s', (status, label) => {
    expect(STATUS_LABELS[status]).toBe(label);
    expect(statusLabel(status)).toBe(label);
  });

  it('renders the creation row (null from_status) as a dash', () => {
    expect(statusLabel(null)).toBe('—');
  });

  it('labels both roles in Russian', () => {
    expect(ROLE_LABELS).toEqual({ manager: 'Постановщик', assignee: 'Исполнитель' });
  });
});

describe('transition table', () => {
  it('has exactly the 5 legal moves from the spec', () => {
    expect(TRANSITIONS.map((t) => `${t.from}->${t.to}:${t.actor}`)).toEqual([
      'new->in_progress:assignee',
      'in_progress->under_review:assignee',
      'under_review->accepted:manager',
      'under_review->needs_rework:manager',
      'needs_rework->in_progress:assignee',
    ]);
  });

  it('sorts accepted last', () => {
    const sorted = (['accepted', 'new', 'under_review'] as TaskStatus[]).slice().sort(compareByStatus);
    expect(sorted).toEqual(['new', 'under_review', 'accepted']);
  });
});
