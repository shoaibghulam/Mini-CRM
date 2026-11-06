import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Browser Supabase client. Uses only the public anon/publishable key: every
 * permission is enforced in the database (grants + RLS + the status RPC),
 * so nothing here is trusted. `service_role` must never appear in the frontend.
 */
function readEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const value = import.meta.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`
    );
  }
  return value.trim();
}

export const supabase = createClient<Database>(
  readEnv('VITE_SUPABASE_URL'),
  readEnv('VITE_SUPABASE_ANON_KEY')
);
