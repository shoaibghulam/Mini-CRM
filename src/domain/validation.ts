/** Trimmed comment, or null when empty. Mirrors `nullif(btrim(p_comment), '')` in the RPC. */
export function normalizeComment(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

export function isValidRequiredComment(raw: string | null | undefined): boolean {
  return normalizeComment(raw) !== null;
}

/** Route param -> positive integer id, or null for anything else ("abc", "-1", "1.5"). */
export function parseId(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Mantine-form style validator: error text or null. */
export function requiredText(message: string) {
  return (value: string): string | null => (value.trim() === '' ? message : null);
}
