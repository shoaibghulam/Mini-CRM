import type { PostgrestError } from '@supabase/supabase-js';

/** Throws the Supabase error as-is (keeps `code` for describeError), otherwise returns data. */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw result.error;
  if (result.data === null) throw new Error('Пустой ответ от сервера');
  return result.data;
}

/**
 * RLS turns a forbidden UPDATE/DELETE into "0 rows affected" rather than an
 * error, so writes ask for the affected rows back and fail loudly on none.
 */
export function requireAffected<T>(rows: readonly T[]): T {
  const [first] = rows;
  if (first === undefined) throw new Error('Запись не найдена или нет прав на изменение');
  return first;
}
