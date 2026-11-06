// Checks for 0006_hardening.sql: soft delete, Unicode-blank comments, length limits,
// is_assignee_user() no longer client-callable.
import { assert, type Ctx } from '../lib/verify-harness.ts';

type Check = (name: string, fn: (c: Ctx) => Promise<void>) => Promise<void>;
const RPC = 'select public.change_task_status($1, $2, $3)';
const DELETE_TASK = 'select public.delete_task($1)';

// Row counts read as the owner (no RLS): what is really in the table.
async function ownerCount(c: Ctx, sql: string, params: unknown[]): Promise<number> {
  await c.query('reset role');
  const { rows } = await c.query<{ n: string }>(sql, params);
  return Number(rows[0]?.n);
}

export async function hardeningChecks(check: Check): Promise<void> {
  await check('manager delete_task hides the task, history rows are kept', async (c) => {
    const id = c.fx.task.aliceAccepted; // accepted tasks may be archived too
    const historySql = 'select count(*) n from public.task_status_history where task_id = $1';
    const before = await ownerCount(c, historySql, [id]);
    await c.as('manager');
    await c.query(DELETE_TASK, [id]);
    const seen = await c.query('select 1 from public.tasks where id = $1', [id]);
    const seenHistory = await c.query('select 1 from public.task_status_history where task_id = $1', [id]);
    assert(seen.rowCount === 0 && seenHistory.rowCount === 0, 'archived task or its history still visible to manager');
    await c.as('alice');
    const aliceSees = await c.query('select 1 from public.task_status_history where task_id = $1', [id]);
    assert(aliceSees.rowCount === 0, 'archived history visible to the assignee');
    const after = await ownerCount(c, historySql, [id]);
    const archived = await ownerCount(c,
      'select count(*) n from public.tasks where id = $1 and deleted_at is not null and deleted_by = $2',
      [id, c.fx.users.manager]);
    assert(before > 0 && after === before, `history rows ${before} -> ${after}`);
    assert(archived === 1, 'deleted_at / deleted_by not set');
  });

  await check('archived task: RPC and second delete say "task not found"', async (c) => {
    await c.as('manager');
    await c.query(DELETE_TASK, [c.fx.task.aliceNew]);
    await c.expectError(DELETE_TASK, [c.fx.task.aliceNew], 'P0002');
    await c.as('alice');
    await c.expectError(RPC, [c.fx.task.aliceNew, 'in_progress', null], 'P0002');
    const upd = await c.query('update public.tasks set title = \'x\' where id = $1', [c.fx.task.aliceNew]);
    assert(upd.rowCount === 0, 'archived task updated');
  });

  await check('archived task still blocks deleting its site (FK RESTRICT)', async (c) => {
    await c.as('manager');
    const { rows } = await c.query<{ id: string }>('select id from public.tasks where site_id = $1', [c.fx.site.aliceOnly]);
    for (const row of rows) await c.query(DELETE_TASK, [row.id]);
    await c.expectError('delete from public.sites where id = $1', [c.fx.site.aliceOnly], '23503');
  });

  await check('assignee cannot call delete_task; nobody can DELETE tasks directly', async (c) => {
    await c.as('alice');
    await c.expectError(DELETE_TASK, [c.fx.task.aliceNew], '42501');
    await c.as('manager');
    await c.expectError('delete from public.tasks where id = $1', [c.fx.task.aliceNew], '42501');
    await c.expectError('update public.tasks set deleted_at = now() where id = $1', [c.fx.task.aliceNew], '42501');
    await c.as('anon');
    await c.expectError(DELETE_TASK, [c.fx.task.aliceNew], '42501');
  });

  await check('history cannot be removed by a hard task delete, even by the owner', async (c) => {
    await c.query('reset role');
    await c.expectError('delete from public.tasks where id = $1', [c.fx.task.aliceNew], '23503');
  });

  const blanks = [
    ['NBSP', '  '], ['zero-width space', '​'], ['BOM', '﻿'],
    ['ideographic space', '　  '], ['mixed separators', '     '],
  ] as const;
  for (const [label, comment] of blanks) {
    await check(`RPC: needs_rework with ${label}-only comment fails`, async (c) => {
      await c.as('manager');
      await c.expectError(RPC, [c.fx.task.bobReview, 'needs_rework', comment], '23514');
    });
  }

  await check('RPC: comment keeps inner spacing, trims ends', async (c) => {
    await c.as('manager');
    await c.query(RPC, [c.fx.task.bobReview, 'needs_rework', '  Шов  в осях 3–4\nпеределать  ']);
    const { rows } = await c.query<{ comment: string }>(
      'select comment from public.task_status_history where task_id = $1 order by id desc limit 1', [c.fx.task.bobReview]);
    assert(rows[0]?.comment === 'Шов  в осях 3–4\nпеределать', `stored: ${JSON.stringify(rows[0]?.comment)}`);
  });

  await check('RPC: comment over 2000 chars -> "comment is too long"', async (c) => {
    await c.as('manager');
    await c.query('savepoint long');
    let message = '';
    try {
      await c.query(RPC, [c.fx.task.bobReview, 'needs_rework', 'а'.repeat(2001)]);
    } catch (error) {
      message = (error as Error).message;
    }
    await c.query('rollback to savepoint long');
    assert(message === 'comment is too long', `got: ${message || 'success'}`);
  });

  await check('length limits: title > 200, description > 5000, site name > 200 rejected', async (c) => {
    await c.as('manager');
    await c.expectError('insert into public.tasks (site_id, assignee_id, title) values ($1, $2, $3)',
      [c.fx.site.aliceOnly, c.fx.users.alice, 'x'.repeat(201)], '23514');
    await c.expectError('update public.tasks set description = $1 where id = $2',
      ['x'.repeat(5001), c.fx.task.bobNew], '23514');
    await c.expectError('insert into public.sites (name) values ($1)', ['x'.repeat(201)], '23514');
  });

  await check('is_assignee_user() is not executable by authenticated', async (c) => {
    await c.as('manager');
    await c.expectError('select public.is_assignee_user($1)', [c.fx.users.alice], '42501');
  });

  await check('assignee-role check still works via definer triggers', async (c) => {
    await c.as('manager');
    await c.expectError('update public.tasks set assignee_id = $1 where id = $2',
      [c.fx.users.manager, c.fx.task.bobNew], '23514');
    const ok = await c.query('update public.tasks set assignee_id = $1 where id = $2',
      [c.fx.users.alice, c.fx.task.bobNew]);
    assert(ok.rowCount === 1, 'legal reassignment failed');
  });
}
