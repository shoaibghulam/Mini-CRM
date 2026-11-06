import { supabase } from '@/lib/supabase';
import type { SiteRow } from '@/lib/database.types';
import { requireAffected, unwrap } from '@/api/result';

const COLUMNS = 'id, name, address, created_at';

export interface SiteInput {
  name: string;
  address: string;
}

/** RLS: managers get every site, assignees only sites where they have a task. */
export async function fetchSites(): Promise<SiteRow[]> {
  return unwrap(await supabase.from('sites').select(COLUMNS).order('name'));
}

export async function fetchSite(id: number): Promise<SiteRow | null> {
  const { data, error } = await supabase.from('sites').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSite(input: SiteInput): Promise<SiteRow> {
  return unwrap(await supabase.from('sites').insert(input).select(COLUMNS).single());
}

export async function updateSite(id: number, input: SiteInput): Promise<SiteRow> {
  return requireAffected(unwrap(await supabase.from('sites').update(input).eq('id', id).select(COLUMNS)));
}

/** Fails with FK error 23503 while the site still has tasks (ON DELETE RESTRICT). */
export async function deleteSite(id: number): Promise<void> {
  requireAffected(unwrap(await supabase.from('sites').delete().eq('id', id).select('id')));
}
