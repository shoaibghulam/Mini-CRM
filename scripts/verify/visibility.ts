// Read-side checks: who can see which rows. (RLS)
import { assert, type Ctx } from '../lib/verify-harness.ts';

type Check = (name: string, fn: (c: Ctx) => Promise<void>) => Promise<void>;

export async function visibilityChecks(check: Check): Promise<void> {
  await check('alice sees only her own tasks', async (c) => {
    await c.as('alice');
    const { rows } = await c.query<{ assignee_id: string }>('select assignee_id from public.tasks');
    assert(rows.length > 0, 'alice sees no tasks at all');
    assert(rows.every((r) => r.assignee_id === c.fx.users.alice), 'alice sees a task that is not hers');
  });

  await check('bob sees only his own tasks', async (c) => {
    await c.as('bob');
    const { rows } = await c.query<{ assignee_id: string }>('select assignee_id from public.tasks');
    assert(rows.length > 0, 'bob sees no tasks at all');
    assert(rows.every((r) => r.assignee_id === c.fx.users.bob), 'bob sees a task that is not his');
  });

  await check('alice cannot read bob\'s task by id', async (c) => {
    await c.as('alice');
    const { rowCount } = await c.query('select 1 from public.tasks where id = $1', [c.fx.task.bobReview]);
    assert(rowCount === 0, 'bob\'s task is visible to alice');
  });

  await check('bob does not see the site where he has no tasks', async (c) => {
    // Expected set computed as the owner (no RLS): distinct sites of bob's tasks.
    const expected = await c.query('select distinct site_id from public.tasks where assignee_id = $1 and deleted_at is null', [c.fx.users.bob]);
    await c.as('bob');
    const { rows } = await c.query<{ id: string }>('select id from public.sites');
    const ids = rows.map((r) => Number(r.id));
    assert(!ids.includes(c.fx.site.aliceOnly), 'bob sees the alice-only site');
    assert(ids.length === expected.rowCount, `bob should see ${expected.rowCount} sites, sees ${ids.length}`);
  });

  await check('embedded sites -> tasks shows bob only his tasks', async (c) => {
    await c.as('bob');
    const { rows } = await c.query<{ assignee_id: string }>(
      'select t.assignee_id from public.sites s join public.tasks t on t.site_id = s.id');
    assert(rows.every((r) => r.assignee_id === c.fx.users.bob), 'foreign task leaked through a join');
  });

  await check('manager sees all sites and tasks', async (c) => {
    const count = (sql: string) => c.query(sql).then((r) => r.rowCount);
    const ownerSites = await count('select 1 from public.sites');   // as owner, no RLS
    const ownerTasks = await count('select 1 from public.tasks where deleted_at is null');
    await c.as('manager');
    const sites = await count('select 1 from public.sites');
    const tasks = await count('select 1 from public.tasks');
    assert(sites === ownerSites && tasks === ownerTasks, `manager sees sites=${sites}/${ownerSites} tasks=${tasks}/${ownerTasks}`);
  });

  await check('alice sees history only of her own tasks', async (c) => {
    await c.as('alice');
    const { rows } = await c.query<{ task_id: string }>('select task_id from public.task_status_history');
    const own = await c.query<{ id: string }>('select id from public.tasks');
    const ownIds = new Set(own.rows.map((r) => r.id));
    assert(rows.length > 0 && rows.every((r) => ownIds.has(r.task_id)), 'foreign history visible');
  });

  await check('alice sees profiles of self + manager only, not bob', async (c) => {
    await c.as('alice');
    const { rows } = await c.query<{ id: string }>('select id from public.profiles');
    const ids = rows.map((r) => r.id).sort();
    const expected = [c.fx.users.alice, c.fx.users.manager].sort();
    assert(JSON.stringify(ids) === JSON.stringify(expected), `alice sees ${ids.length} profiles`);
  });

  await check('task_transitions is not readable by clients', async (c) => {
    await c.as('manager');
    await c.expectError('select * from public.task_transitions', [], '42501');
  });

  await check('anon: every table is denied', async (c) => {
    await c.as('anon');
    for (const table of ['profiles', 'sites', 'tasks', 'task_status_history', 'task_transitions']) {
      await c.expectError(`select * from public.${table}`, [], '42501');
    }
  });

  await check('anon: change_task_status and helpers are not executable', async (c) => {
    await c.as('anon');
    await c.expectError('select public.change_task_status($1, \'in_progress\')', [c.fx.task.aliceNew], '42501');
    await c.expectError('select public.is_manager()', [], '42501');
  });
}
