// Seeds demo users (auth.users + auth.identities + profiles), sites, tasks and history.
// Sign-up stays disabled, so users are created directly in SQL.
// Sites/tasks are created and every status change is made through the real API path:
// role "authenticated" + JWT claims of the right user, then change_task_status().
// Usage: SUPABASE_DB_PASSWORD=... DEMO_MANAGER_PASSWORD=... DEMO_ASSIGNEE_PASSWORD=... npm run db:seed
import type pg from 'pg';
import { connect, errorMessage, impersonate, inTransaction, requireEnv } from './lib/db.ts';
import { DEMO_SITES, DEMO_TASKS, DEMO_USERS, type DemoUser, type UserKey } from './seed-data.ts';

type UserIds = Record<UserKey, string>;

// Creates the auth user + email identity if the email is new. Returns the user id.
async function ensureAuthUser(client: pg.Client, user: DemoUser): Promise<string> {
  const existing = await client.query<{ id: string }>('select id from auth.users where email = $1', [user.email]);
  if (existing.rows[0]) {
    console.log(`user   ${user.email} exists, kept as is`);
    return existing.rows[0].id;
  }
  const password = requireEnv(user.passwordEnv);
  // GoTrue fails on NULL token columns, so they are set to ''.
  const { rows } = await client.query<{ id: string }>(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
       'authenticated', $1, extensions.crypt($2, extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
     returning id`,
    [user.email, password],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`insert into auth.users returned no id for ${user.email}`);
  await client.query(
    `insert into auth.identities
       (provider, provider_id, user_id, identity_data, last_sign_in_at, created_at, updated_at)
     values ('email', $1::text, $1::uuid,
       jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true),
       now(), now(), now())`,
    [id, user.email],
  );
  console.log(`user   ${user.email} created`);
  return id;
}

async function seedUsers(client: pg.Client): Promise<UserIds> {
  return inTransaction(client, async () => {
    const ids: Partial<UserIds> = {};
    for (const user of DEMO_USERS) {
      const id = await ensureAuthUser(client, user);
      // Profiles are owner-only (no client write path); upsert keeps name/role in sync.
      await client.query(
        `insert into public.profiles (id, full_name, role) values ($1, $2, $3)
         on conflict (id) do update set full_name = excluded.full_name, role = excluded.role`,
        [id, user.fullName, user.role],
      );
      ids[user.key] = id;
    }
    return ids as UserIds;
  });
}

// Creates sites and tasks as the manager, exactly like the frontend would.
async function createSitesAndTasks(client: pg.Client, ids: UserIds): Promise<number[]> {
  return inTransaction(client, async () => {
    await impersonate(client, ids.manager);
    const siteIds: number[] = [];
    for (const site of DEMO_SITES) {
      const { rows } = await client.query<{ id: string }>(
        'insert into public.sites (name, address) values ($1, $2) returning id', [site.name, site.address]);
      siteIds.push(Number(rows[0]?.id));
    }
    const taskIds: number[] = [];
    for (const task of DEMO_TASKS) {
      // status/author_id are not sent: the trigger forces 'new' and auth.uid().
      const { rows } = await client.query<{ id: string }>(
        `insert into public.tasks (site_id, assignee_id, title, description)
         values ($1, $2, $3, $4) returning id`,
        [siteIds[task.siteIndex], ids[task.assignee], task.title, task.description]);
      taskIds.push(Number(rows[0]?.id));
    }
    return taskIds;
  });
}

// Replays every status change through the RPC, one transaction per change, round-robin
// across tasks so history timestamps interleave like real work.
async function runTransitions(client: pg.Client, ids: UserIds, taskIds: number[]): Promise<void> {
  const rounds = Math.max(...DEMO_TASKS.map((t) => t.steps.length));
  for (let round = 0; round < rounds; round++) {
    for (const [index, task] of DEMO_TASKS.entries()) {
      const step = task.steps[round];
      if (!step) continue;
      const actor = step.by === 'assignee' ? task.assignee : step.by;
      await inTransaction(client, async () => {
        await impersonate(client, ids[actor]);
        await client.query('select public.change_task_status($1, $2, $3)',
          [taskIds[index], step.to, step.comment ?? null]);
      });
    }
  }
}

async function main(): Promise<void> {
  const client = await connect();
  try {
    const ids = await seedUsers(client);
    const marker = await client.query('select 1 from public.sites where name = $1', [DEMO_SITES[0]?.name]);
    if (marker.rowCount) {
      console.log('demo   sites already seeded, skipping sites/tasks/history');
      return;
    }
    const taskIds = await createSitesAndTasks(client, ids);
    console.log(`demo   ${DEMO_SITES.length} sites, ${taskIds.length} tasks created`);
    try {
      await runTransitions(client, ids, taskIds);
    } catch (error) {
      throw new Error(`${errorMessage(error)}. Sites/tasks exist but history is partial: ` +
        'delete the demo sites/tasks as postgres and re-run.');
    }
    console.log('demo   status history replayed through change_task_status()');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`db:seed failed: ${errorMessage(error)}`);
  process.exit(1);
});
