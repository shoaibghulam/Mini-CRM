// Tiny test harness for db-verify: every case runs in its own transaction, which is
// always rolled back, so the live data is never changed.
import type pg from 'pg';
import { errorMessage, impersonate } from './db.ts';

export type Actor = 'manager' | 'alice' | 'bob' | 'anon';

export interface Fixture {
  users: Record<Exclude<Actor, 'anon'>, string>;
  task: { aliceNew: number; aliceAccepted: number; bobNew: number; bobReview: number };
  site: { aliceOnly: number }; // the site where bob has no tasks
}

export interface Ctx {
  // Switch the transaction to this user (role + JWT claims).
  as(actor: Actor): Promise<void>;
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]): Promise<pg.QueryResult<R>>;
  // The statement must fail with this SQLSTATE. Uses a savepoint so the case can continue.
  expectError(sql: string, params: unknown[], code: string): Promise<void>;
  fx: Fixture;
}

export class AssertionFailed extends Error {}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new AssertionFailed(message);
}

export function createRunner(client: pg.Client, fx: Fixture) {
  let failures = 0;
  let total = 0;

  const ctx: Ctx = {
    fx,
    async as(actor) {
      await client.query('reset role');
      await impersonate(client, actor === 'anon' ? null : fx.users[actor], actor === 'anon' ? 'anon' : 'authenticated');
    },
    query: (sql, params) => client.query(sql, params),
    async expectError(sql, params, code) {
      await client.query('savepoint expect_error');
      let outcome: string;
      try {
        await client.query(sql, params);
        outcome = 'statement succeeded';
      } catch (error) {
        const actual = (error as { code?: string }).code;
        outcome = actual === code ? 'ok' : `expected SQLSTATE ${code}, got ${errorMessage(error)}`;
      }
      await client.query('rollback to savepoint expect_error');
      assert(outcome === 'ok', outcome);
    },
  };

  async function check(name: string, fn: (c: Ctx) => Promise<void>): Promise<void> {
    total++;
    await client.query('begin');
    try {
      await fn(ctx);
      console.log(`PASS  ${name}`);
    } catch (error) {
      failures++;
      console.log(`FAIL  ${name}\n      -> ${errorMessage(error)}`);
    } finally {
      await client.query('rollback');
    }
  }

  return { check, summary: () => ({ total, failures }) };
}
