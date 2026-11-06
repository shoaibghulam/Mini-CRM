// SQL-level security checks against the live DB, impersonating each demo user the way
// PostgREST does (role authenticated/anon + request.jwt.claims). Every case runs in a
// transaction that is rolled back. Exits non-zero if any case fails.
// Requires the seed data (npm run db:seed).
// Usage: SUPABASE_DB_PASSWORD=... npm run db:verify
import type pg from 'pg';
import { connect, errorMessage } from './lib/db.ts';
import { createRunner, type Fixture } from './lib/verify-harness.ts';
import { hardeningChecks } from './verify/hardening.ts';
import { transitionChecks } from './verify/transitions.ts';
import { visibilityChecks } from './verify/visibility.ts';
import { writeChecks } from './verify/writes.ts';
import { DEMO_SITES } from './seed-data.ts';

async function one(client: pg.Client, sql: string, params: unknown[], what: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) throw new Error(`fixture not found: ${what} (run npm run db:seed first)`);
  return id;
}

// Looks up ids as postgres (no impersonation) so the checks can target specific rows.
async function loadFixture(client: pg.Client): Promise<Fixture> {
  const user = (email: string) => one(client, 'select id from auth.users where email = $1', [email], email);
  const users = { manager: await user('manager@demo.test'), alice: await user('alice@demo.test'), bob: await user('bob@demo.test') };
  const taskIn = async (assignee: string, status: string) => Number(await one(client,
    'select id from public.tasks where assignee_id = $1 and status = $2 and deleted_at is null order by id limit 1',
    [assignee, status], `${status} task`));
  return {
    users,
    task: {
      aliceNew: await taskIn(users.alice, 'new'),
      aliceAccepted: await taskIn(users.alice, 'accepted'),
      bobNew: await taskIn(users.bob, 'new'),
      bobReview: await taskIn(users.bob, 'under_review'),
    },
    site: {
      aliceOnly: Number(await one(client, 'select id from public.sites where name = $1', [DEMO_SITES[2]?.name], 'alice-only site')),
    },
  };
}

async function main(): Promise<number> {
  const client = await connect();
  try {
    const runner = createRunner(client, await loadFixture(client));
    await visibilityChecks(runner.check);
    await writeChecks(runner.check);
    await transitionChecks(runner.check);
    await hardeningChecks(runner.check);
    const { total, failures } = runner.summary();
    console.log(failures ? `\n${failures} of ${total} checks FAILED` : `\nALL ${total} CHECKS PASSED`);
    return failures ? 1 : 0;
  } finally {
    await client.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`db:verify failed: ${errorMessage(error)}`);
    process.exit(1);
  },
);
