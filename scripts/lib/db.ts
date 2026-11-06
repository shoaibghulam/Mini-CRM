// Shared Postgres connection for the db:* scripts.
// Credentials come from the environment only (or a local, gitignored .env).
import 'dotenv/config';
import pg from 'pg';

const DEFAULT_HOST = 'aws-1-eu-central-1.pooler.supabase.com'; // session pooler (IPv4)
const DEFAULT_USER = 'postgres.wfgzypvgfadvoahnadvl';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

// A config object, not a connection URL: the password may contain URL-special chars.
export async function connect(): Promise<pg.Client> {
  const client = new pg.Client({
    host: process.env.SUPABASE_DB_HOST ?? DEFAULT_HOST,
    port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
    user: process.env.SUPABASE_DB_USER ?? DEFAULT_USER,
    database: process.env.SUPABASE_DB_NAME ?? 'postgres',
    password: requireEnv('SUPABASE_DB_PASSWORD'),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

// Make the rest of the transaction behave like a PostgREST request from this user:
// role "authenticated" + JWT claims, both scoped to the current transaction only.
export async function impersonate(
  client: pg.Client,
  userId: string | null,
  role: 'authenticated' | 'anon' = 'authenticated',
): Promise<void> {
  await client.query(`set local role ${role === 'anon' ? 'anon' : 'authenticated'}`);
  const claims = userId ? { sub: userId, role } : { role };
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
}

// Run fn inside BEGIN ... COMMIT (or ROLLBACK on error / when rollback = true).
export async function inTransaction<T>(
  client: pg.Client,
  fn: () => Promise<T>,
  rollback = false,
): Promise<T> {
  await client.query('begin');
  try {
    const result = await fn();
    await client.query(rollback ? 'rollback' : 'commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    return code ? `[${code}] ${error.message}` : error.message;
  }
  return String(error);
}
