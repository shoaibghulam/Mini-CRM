// Applies supabase/migrations/*.sql in filename order, each in its own transaction.
// Applied files are tracked in private._migrations (a schema PostgREST does not expose),
// so re-running only applies new files.
// Usage: SUPABASE_DB_PASSWORD=... npm run db:apply
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { connect, errorMessage, inTransaction } from './lib/db.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');
const LOCK_KEY = 727_001; // arbitrary advisory-lock id: one apply at a time

async function ensureTrackingTable(client: pg.Client): Promise<void> {
  await client.query(`
    create schema if not exists private;
    revoke all on schema private from public, anon, authenticated;
    create table if not exists private._migrations (
      filename   text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    );`);
}

async function appliedChecksums(client: pg.Client): Promise<Map<string, string>> {
  const { rows } = await client.query<{ filename: string; checksum: string }>(
    'select filename, checksum from private._migrations',
  );
  return new Map(rows.map((r) => [r.filename, r.checksum]));
}

async function main(): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const client = await connect();
  client.on('notice', (n) => console.log(`  notice: ${n.message}`));
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await ensureTrackingTable(client);
    const applied = await appliedChecksums(client);

    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = applied.get(file);
      if (previous) {
        const note = previous === checksum ? '' : ' (WARNING: file changed since it was applied)';
        console.log(`skip   ${file}${note}`);
        continue;
      }
      await inTransaction(client, async () => {
        await client.query(sql);
        await client.query('insert into private._migrations (filename, checksum) values ($1, $2)', [
          file,
          checksum,
        ]);
      }).catch((error: unknown) => {
        throw new Error(`${file} failed and was rolled back: ${errorMessage(error)}`);
      });
      console.log(`apply  ${file}`);
    }
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`db:apply failed: ${errorMessage(error)}`);
  process.exit(1);
});
