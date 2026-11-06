import { formatRelative, nameOf, pluralRu } from '@/lib/format';

const NOW = new Date('2026-11-06T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('formatRelative', () => {
  it('says "только что" within a minute', () => {
    expect(formatRelative(ago(20_000), NOW)).toBe('только что');
  });

  it('uses minutes and hours for recent events', () => {
    expect(formatRelative(ago(5 * 60_000), NOW)).toBe('5 минут назад');
    expect(formatRelative(ago(3 * 3_600_000), NOW)).toBe('3 часа назад');
  });

  it('uses "вчера" for one day ago', () => {
    expect(formatRelative(ago(24 * 3_600_000), NOW)).toBe('вчера');
  });

  it('falls back to an absolute date after 30 days', () => {
    expect(formatRelative(ago(40 * 24 * 3_600_000), NOW)).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });
});

describe('pluralRu', () => {
  const forms = ['задача', 'задачи', 'задач'] as const;
  it.each([
    [1, 'задача'],
    [2, 'задачи'],
    [5, 'задач'],
    [11, 'задач'],
    [12, 'задач'],
    [21, 'задача'],
    [24, 'задачи'],
    [0, 'задач'],
  ])('%i -> %s', (n, expected) => {
    expect(pluralRu(n, forms)).toBe(expected);
  });
});

describe('nameOf', () => {
  it('falls back for unknown ids', () => {
    expect(nameOf(new Map([['a', 'Анна']]), 'b')).toBe('Неизвестный пользователь');
  });
});
