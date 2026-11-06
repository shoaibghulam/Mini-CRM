// State-machine checks: change_task_status() rejects every illegal move and runs the
// legal flow end to end with correct history.
import { assert, type Ctx } from '../lib/verify-harness.ts';

type Check = (name: string, fn: (c: Ctx) => Promise<void>) => Promise<void>;
const RPC = 'select public.change_task_status($1, $2, $3)';

export async function transitionChecks(check: Check): Promise<void> {
  await check('RPC: skipping states fails (new -> accepted, new -> under_review)', async (c) => {
    await c.as('alice');
    await c.expectError(RPC, [c.fx.task.aliceNew, 'accepted', null], '23514');
    await c.expectError(RPC, [c.fx.task.aliceNew, 'under_review', null], '23514');
  });

  await check('RPC: nothing leaves accepted', async (c) => {
    await c.as('manager');
    await c.expectError(RPC, [c.fx.task.aliceAccepted, 'needs_rework', 'x'], '23514');
    await c.as('alice');
    await c.expectError(RPC, [c.fx.task.aliceAccepted, 'in_progress', null], '23514');
  });

  await check('RPC: alice on bob\'s task -> "task not found"', async (c) => {
    await c.as('alice');
    await c.expectError(RPC, [c.fx.task.bobNew, 'in_progress', null], 'P0002');
  });

  await check('RPC: manager cannot do assignee moves (new -> in_progress)', async (c) => {
    await c.as('manager');
    await c.expectError(RPC, [c.fx.task.aliceNew, 'in_progress', null], '42501');
  });

  await check('RPC: assignee cannot accept own task under review', async (c) => {
    await c.as('bob');
    await c.expectError(RPC, [c.fx.task.bobReview, 'accepted', null], '42501');
  });

  for (const [label, comment] of [['null', null], ['empty', ''], ['spaces', '   '], ['tab/newline', '\t\n \r']] as const) {
    await check(`RPC: needs_rework with ${label} comment fails`, async (c) => {
      await c.as('manager');
      await c.expectError(RPC, [c.fx.task.bobReview, 'needs_rework', comment], '23514');
      const { rows } = await c.query<{ status: string }>('select status from public.tasks where id = $1', [c.fx.task.bobReview]);
      assert(rows[0]?.status === 'under_review', 'status changed despite the error');
    });
  }

  await check('RPC: no history row is written by a failed transition', async (c) => {
    await c.as('manager');
    const before = await c.query('select 1 from public.task_status_history where task_id = $1', [c.fx.task.aliceNew]);
    await c.as('alice');
    await c.expectError(RPC, [c.fx.task.aliceNew, 'accepted', null], '23514');
    await c.as('manager');
    const after = await c.query('select 1 from public.task_status_history where task_id = $1', [c.fx.task.aliceNew]);
    assert(before.rowCount === after.rowCount, 'history row count changed');
  });

  await check('manager + assignee: full legal flow end to end', async (c) => {
    await c.as('manager');
    const created = await c.query<{ id: string; status: string; author_id: string }>(
      `insert into public.tasks (site_id, assignee_id, title) values ($1, $2, 'verify flow')
       returning id, status, author_id`, [c.fx.site.aliceOnly, c.fx.users.alice]);
    const task = created.rows[0];
    if (!task) throw new Error('insert returned no row');
    assert(task.status === 'new' && task.author_id === c.fx.users.manager, 'insert did not force status/author');
    const id = Number(task.id);
    const steps = [
      ['alice', 'in_progress', null], ['alice', 'under_review', null],
      ['manager', 'needs_rework', '  Переделать узел  '], ['alice', 'in_progress', null],
      ['alice', 'under_review', null], ['manager', 'accepted', null],
    ] as const;
    for (const [actor, to, comment] of steps) {
      await c.as(actor);
      const r = await c.query<{ status: string }>('select (public.change_task_status($1, $2, $3)).status', [id, to, comment]);
      assert(r.rows[0]?.status === to, `expected ${to}`);
    }
    await c.as('alice'); // the assignee can read the full history of her task
    const { rows } = await c.query<{ actor_id: string; from_status: string | null; to_status: string; comment: string | null }>(
      'select actor_id, from_status, to_status, comment from public.task_status_history where task_id = $1 order by id', [id]);
    assert(rows.length === 7, `expected 7 history rows, got ${rows.length}`);
    assert(rows[0]?.from_status === null && rows[0].actor_id === c.fx.users.manager, 'bad creation row');
    assert(rows[3]?.comment === 'Переделать узел', 'rework comment not stored trimmed');
    const actors = rows.slice(1).map((r) => (r.actor_id === c.fx.users.manager ? 'manager' : 'alice'));
    assert(actors.join() === steps.map((s) => s[0]).join(), 'history actors do not match callers');
  });
}
