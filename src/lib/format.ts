const DATE_TIME = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const LONG_DATE_TIME = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
const RELATIVE = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RELATIVE_LIMIT_DAYS = 30;

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function formatLongDateTime(iso: string): string {
  return LONG_DATE_TIME.format(new Date(iso));
}

/** "только что", "5 минут назад", "вчера"... Falls back to a short date after 30 days. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diff = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < MINUTE) return 'только что';
  if (abs < HOUR) return RELATIVE.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return RELATIVE.format(Math.round(diff / HOUR), 'hour');
  if (abs < RELATIVE_LIMIT_DAYS * DAY) return RELATIVE.format(Math.round(diff / DAY), 'day');
  return formatDateTime(iso);
}

export function nameOf(names: ReadonlyMap<string, string>, id: string): string {
  return names.get(id) ?? 'Неизвестный пользователь';
}

/** Russian plural form: pluralRu(5, ['задача', 'задачи', 'задач']) -> 'задач'. */
export function pluralRu(n: number, forms: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
