import { supabase } from '@/lib/supabase';
import type { ProfileRow } from '@/lib/database.types';
import { unwrap } from '@/api/result';

const COLUMNS = 'id, full_name, role, created_at';

/** Own profile (role source of truth). null = auth user without a profiles row. */
export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Users with role assignee, for the manager's assignee dropdown. */
export async function fetchAssignees(): Promise<ProfileRow[]> {
  return unwrap(
    await supabase.from('profiles').select(COLUMNS).eq('role', 'assignee').order('full_name')
  );
}

/**
 * Names for a set of user ids. RLS limits what an assignee may read, so ids
 * that are not visible are simply missing from the map.
 */
export async function fetchProfileNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = unwrap(await supabase.from('profiles').select('id, full_name').in('id', unique));
  return new Map(rows.map((p) => [p.id, p.full_name]));
}
