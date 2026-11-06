import { latestReworkComment, waitingHint } from '@/domain/nextStep';

describe('waitingHint', () => {
  it('says the task is done when accepted, for any role', () => {
    expect(waitingHint('accepted', 'manager')).toMatch(/принята/);
    expect(waitingHint('accepted', 'assignee')).toMatch(/принята/);
  });

  it('tells the assignee that review is pending', () => {
    expect(waitingHint('under_review', 'assignee')).toMatch(/Ждём решения/);
  });

  it('tells the manager what the assignee is doing', () => {
    expect(waitingHint('new', 'manager')).toMatch(/ещё не взял/);
    expect(waitingHint('in_progress', 'manager')).toMatch(/выполняет/);
    expect(waitingHint('needs_rework', 'manager')).toMatch(/доработку/);
  });

  it('falls back to a neutral note for an assignee without actions', () => {
    expect(waitingHint('new', 'assignee')).toMatch(/действий/);
  });
});

describe('latestReworkComment', () => {
  const history = [
    { to_status: 'needs_rework' as const, comment: 'Первое замечание' },
    { to_status: 'in_progress' as const, comment: null },
    { to_status: 'needs_rework' as const, comment: 'Второе замечание' },
  ];

  it('returns the newest rework comment while the task needs rework', () => {
    expect(latestReworkComment('needs_rework', history)).toBe('Второе замечание');
  });

  it('returns null in any other status', () => {
    expect(latestReworkComment('in_progress', history)).toBeNull();
  });

  it('returns null when there is no rework entry', () => {
    expect(latestReworkComment('needs_rework', [])).toBeNull();
  });
});
