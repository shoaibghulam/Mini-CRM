// Write-side checks: direct table writes that must fail (grants + RLS + triggers).
import { assert, type Ctx } from '../lib/verify-harness.ts';

type Check = (name: string, fn: (c: Ctx) => Promise<void>) => Promise<void>;

export async function writeChecks(check: Check): Promise<void> {
  await check('alice: direct UPDATE of status fails (no column grant)', async (c) => {
    await c.as('alice');
    await c.expectError('update public.tasks set status = \'in_progress\' where id = $1', [c.fx.task.aliceNew], '42501');
  });

  await check('alice: UPDATE assignee_id / title changes 0 rows (RLS)', async (c) => {
    await c.as('alice');
    const steal = await c.query('update public.tasks set assignee_id = $1 where id = $2',
      [c.fx.users.alice, c.fx.task.bobReview]);
    const edit = await c.query('update public.tasks set title = \'hacked\' where id = $1', [c.fx.task.aliceNew]);
    assert(steal.rowCount === 0 && edit.rowCount === 0, 'assignee update affected rows');
    await c.as('manager');
    const bobTask = await c.query<{ assignee_id: string }>(
      'select assignee_id from public.tasks where id = $1', [c.fx.task.bobReview]);
    const aliceTask = await c.query<{ title: string }>(
      'select title from public.tasks where id = $1', [c.fx.task.aliceNew]);
    assert(bobTask.rows[0]?.assignee_id === c.fx.users.bob, 'bob\'s task was reassigned');
    assert(aliceTask.rows[0]?.title !== 'hacked', 'alice\'s task title was changed');
  });

  await check('alice: INSERT and DELETE on tasks fail / change nothing', async (c) => {
    await c.as('alice');
    await c.expectError('insert into public.tasks (site_id, assignee_id, title) values ($1, $2, \'x\')',
      [c.fx.site.aliceOnly, c.fx.users.alice], '42501');
    // Since 0006 nobody holds DELETE on tasks (soft delete via delete_task()).
    await c.expectError('delete from public.tasks where id = $1', [c.fx.task.aliceNew], '42501');
  });

  await check('alice: INSERT/UPDATE/DELETE on sites fail / change nothing', async (c) => {
    await c.as('alice');
    await c.expectError('insert into public.sites (name) values (\'x\')', [], '42501');
    const upd = await c.query('update public.sites set name = \'x\' where id = $1', [c.fx.site.aliceOnly]);
    const del = await c.query('delete from public.sites where id = $1', [c.fx.site.aliceOnly]);
    assert(upd.rowCount === 0 && del.rowCount === 0, 'assignee changed a site');
  });

  await check('manager: direct UPDATE of status fails', async (c) => {
    await c.as('manager');
    await c.expectError('update public.tasks set status = \'accepted\' where id = $1', [c.fx.task.aliceNew], '42501');
  });

  await check('manager: INSERT with status / foreign author_id fails (column grant)', async (c) => {
    await c.as('manager');
    await c.expectError('insert into public.tasks (site_id, assignee_id, title, status) values ($1, $2, \'x\', \'accepted\')',
      [c.fx.site.aliceOnly, c.fx.users.alice], '42501');
    await c.expectError('insert into public.tasks (site_id, assignee_id, title, author_id) values ($1, $2, \'x\', $2)',
      [c.fx.site.aliceOnly, c.fx.users.alice], '42501');
  });

  await check('manager: task assigned to a manager is rejected', async (c) => {
    await c.as('manager');
    await c.expectError('insert into public.tasks (site_id, assignee_id, title) values ($1, $2, \'x\')',
      [c.fx.site.aliceOnly, c.fx.users.manager], '23514');
  });

  await check('manager: accepted task is frozen, under_review cannot be reassigned', async (c) => {
    await c.as('manager');
    await c.expectError('update public.tasks set title = \'x\' where id = $1', [c.fx.task.aliceAccepted], '23514');
    await c.expectError('update public.tasks set assignee_id = $1 where id = $2',
      [c.fx.users.alice, c.fx.task.bobReview], '23514');
  });

  await check('manager: deleting a site that has tasks fails (FK RESTRICT)', async (c) => {
    await c.as('manager');
    await c.expectError('delete from public.sites where id = $1', [c.fx.site.aliceOnly], '23503');
  });

  for (const actor of ['alice', 'manager'] as const) {
    await check(`${actor}: INSERT/UPDATE/DELETE/TRUNCATE on history fail`, async (c) => {
      await c.as(actor);
      await c.expectError(`insert into public.task_status_history (task_id, actor_id, to_status)
        values ($1, $2, 'accepted')`, [c.fx.task.aliceNew, c.fx.users[actor]], '42501');
      await c.expectError('update public.task_status_history set comment = \'x\'', [], '42501');
      await c.expectError('delete from public.task_status_history', [], '42501');
      await c.expectError('truncate public.task_status_history', [], '42501');
    });
  }

  await check('alice: role self-escalation and fake profile fail', async (c) => {
    await c.as('alice');
    await c.expectError('update public.profiles set role = \'manager\' where id = $1', [c.fx.users.alice], '42501');
    await c.expectError('insert into public.profiles (id, full_name, role) values (gen_random_uuid(), \'x\', \'manager\')',
      [], '42501');
    await c.as('manager');
    const { rows } = await c.query<{ role: string }>('select role from public.profiles where id = $1', [c.fx.users.alice]);
    assert(rows[0]?.role === 'assignee', 'alice role changed');
  });

  await check('manager: cannot edit profiles either', async (c) => {
    await c.as('manager');
    await c.expectError('update public.profiles set role = \'manager\' where id = $1', [c.fx.users.bob], '42501');
  });
}
