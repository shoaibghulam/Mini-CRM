// API-level attack suite (see report). Publishable key only; signs in as each demo user.
// Every attack must FAIL; any unexpected success is reported as BREACH.
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, DEMO_MANAGER_PASSWORD, DEMO_ASSIGNEE_PASSWORD.
// Not covered on purpose: auth.signUp / signInAnonymously (would create real users if the
// dashboard toggle is still on) - verify those two toggles by hand.
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Status = 'new' | 'in_progress' | 'under_review' | 'accepted' | 'needs_rework';
const STATUSES: readonly Status[] = ['new', 'in_progress', 'under_review', 'accepted', 'needs_rework'];
interface Reply { data: unknown; error: { message: string; code?: string } | null; status?: number }
interface TaskRow { id: number; site_id: number; assignee_id: string; title: string; status: Status; author_id: string; description: string }
interface Actor { c: SupabaseClient; id: string; token: string }

function env(name: string): string {
  const v = process.env[name];
  if (!v) { console.error('Missing env ' + name); process.exit(2); }
  return v.trim();
}
const URL = env('VITE_SUPABASE_URL');
const KEY = env('VITE_SUPABASE_ANON_KEY');
const PASSWORDS = { manager: env('DEMO_MANAGER_PASSWORD'), alice: env('DEMO_ASSIGNEE_PASSWORD'), bob: env('DEMO_ASSIGNEE_PASSWORD') };
const EMAILS = { manager: 'manager@demo.test', alice: 'alice@demo.test', bob: 'bob@demo.test' } as const;

const fresh = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function login(who: keyof typeof EMAILS): Promise<Actor> {
  const c = fresh();
  const { data, error } = await c.auth.signInWithPassword({ email: EMAILS[who], password: PASSWORDS[who] });
  if (error || !data.session) throw new Error('login ' + who + ' failed: ' + error?.message);
  return { c, id: data.user.id, token: data.session.access_token };
}

let failed = 0, passed = 0, skipped = 0;
const warnings: string[] = [];
async function check(name: string, fn: () => Promise<true | string>): Promise<void> {
  try {
    const r = await fn();
    if (r === true) { passed++; console.log('PASS  ' + name); }
    else { failed++; console.log('FAIL  ' + name + '\n      -> ' + r); }
  } catch (e) { failed++; console.log('FAIL  ' + name + '\n      -> threw: ' + (e as Error).message); }
}
const skip = (name: string, why: string) => { skipped++; console.log('SKIP  ' + name + ' (' + why + ')'); };
const warn = (name: string, msg: string) => { warnings.push(name + ': ' + msg); console.log('WARN  ' + name + ': ' + msg); };

/** Denied = an error, or an empty result set (RLS filtered everything). Anything else is a BREACH. */
function denied(r: Reply): true | string {
  if (r.error) return true;
  if (r.data === null || r.data === undefined) return true;
  if (Array.isArray(r.data) && r.data.length === 0) return true;
  return 'BREACH: request succeeded, returned ' + JSON.stringify(r.data).slice(0, 160);
}
const onlyError = (r: Reply): true | string => (r.error ? true : 'BREACH: no error, returned ' + JSON.stringify(r.data).slice(0, 160));
const rows = <T,>(r: Reply): T[] => (Array.isArray(r.data) ? (r.data as T[]) : []);
const ZERO = '00000000-0000-4000-8000-000000000000';

// raw HTTP for things supabase-js will not send (forged tokens, graphql, openapi)
async function raw(path: string, token: string | null, init: RequestInit = {}): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = { apikey: KEY, 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(URL + path, { ...init, headers });
  return { status: res.status, body: await res.text() };
}
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const rejected = (r: { status: number; body: string }): true | string =>
  r.status === 401 || r.status === 403 ? true : 'BREACH: status ' + r.status + ' ' + r.body.slice(0, 120);

async function snapshot(m: SupabaseClient): Promise<string> {
  const [t, s, p, h] = await Promise.all([
    m.from('tasks').select('*').order('id'), m.from('sites').select('*').order('id'),
    m.from('profiles').select('*').order('id'), m.from('task_status_history').select('*').order('id'),
  ]);
  return JSON.stringify([t.data, s.data, p.data, h.data]);
}

interface Ctx { manager: Actor; alice: Actor; bob: Actor; anon: SupabaseClient; all: TaskRow[]; aliceTasks: TaskRow[]; bobTasks: TaskRow[] }
const siteIdsOf = (ts: TaskRow[]) => [...new Set(ts.map((t) => t.site_id))].sort((a, b) => a - b);

async function sectionAnonAndForged(x: Ctx): Promise<void> {
  const { anon, alice, manager } = x;
  const aliceTask = x.aliceTasks[0]!, bobTask = x.bobTasks[0]!;
  console.log('--- A. anon key, no session');
  for (const table of ['tasks', 'sites', 'profiles', 'task_status_history', 'task_transitions']) {
    await check('A anon SELECT ' + table + ' denied', async () => denied(await anon.from(table).select('*')));
  }
  await check('A anon INSERT tasks denied', async () => onlyError(await anon.from('tasks').insert({ site_id: bobTask.site_id, assignee_id: x.bob.id, title: 'x' })));
  await check('A anon INSERT sites denied', async () => onlyError(await anon.from('sites').insert({ name: 'x' })));
  await check('A anon PATCH tasks denied', async () => denied(await anon.from('tasks').update({ title: 'x' }).eq('id', aliceTask.id).select('id')));
  await check('A anon DELETE tasks denied', async () => denied(await anon.from('tasks').delete().eq('id', aliceTask.id).select('id')));
  await check('A anon rpc change_task_status denied', async () => onlyError(await anon.rpc('change_task_status', { p_task_id: aliceTask.id, p_new_status: 'in_progress', p_comment: null })));
  await check('A anon rpc is_manager denied', async () => onlyError(await anon.rpc('is_manager')));
  await check('A anon rpc is_assignee_user denied', async () => onlyError(await anon.rpc('is_assignee_user', { p_id: alice.id })));
  await check('A anon GraphQL introspection exposes no app tables', async () => {
    const r = await raw('/graphql/v1', null, { method: 'POST', body: JSON.stringify({ query: '{__schema{types{name}}}' }) });
    return /tasks|profiles|task_status_history|task_transitions|sites/i.test(r.body) ? 'schema names leaked: ' + r.body.slice(0, 200) : true;
  });
  await check('A anon GraphQL query on tasks returns no data', async () => {
    const r = await raw('/graphql/v1', null, { method: 'POST', body: JSON.stringify({ query: '{tasksCollection{edges{node{id}}}}' }) });
    return /"id"\s*:/.test(r.body) ? 'data leaked: ' + r.body.slice(0, 200) : true;
  });
  await check('A anon OpenAPI spec (info disclosure, warn only)', async () => {
    const r = await raw('/rest/v1/', null);
    if (/"\/tasks"|"\/profiles"|"\/task_status_history"/.test(r.body)) warn('A anon OpenAPI', 'schema/column names visible to anon at /rest/v1/ (structure only, no data)');
    return true;
  });

  console.log('\n--- B. forged tokens');
  const [h, p, s] = alice.token.split('.') as [string, string, string];
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>;
  const asManager = b64({ ...payload, sub: manager.id });
  await check('B alice token with swapped sub (bad signature) rejected', async () => rejected(await raw('/rest/v1/tasks?select=id', h + '.' + asManager + '.' + s)));
  await check('B alg=none token claiming manager rejected', async () => rejected(await raw('/rest/v1/tasks?select=id', b64({ alg: 'none', typ: 'JWT' }) + '.' + asManager + '.')));
  await check('B token with role=service_role (bad signature) rejected', async () => rejected(await raw('/rest/v1/profiles?select=id', h + '.' + b64({ ...payload, role: 'service_role' }) + '.' + s)));
}

async function assigneeReads(name: string, me: Actor, other: Actor, mine: TaskRow[], theirs: TaskRow[]): Promise<void> {
  console.log('\n--- C. ' + name + ' (assignee): reads');
  const myIds = new Set(mine.map((t) => t.id));
  const T = (s: string) => 'C ' + name + ' ' + s;
  await check(T('control: sees exactly own tasks'), async () => {
    const got = rows<TaskRow>(await me.c.from('tasks').select('*')).map((t) => t.id).sort();
    const want = [...myIds].sort();
    return JSON.stringify(got) === JSON.stringify(want) ? true : 'got ' + got + ' expected ' + want;
  });
  await check(T('tasks filtered by other assignee_id is empty'), async () => denied(await me.c.from('tasks').select('*').eq('assignee_id', other.id)));
  await check(T('tasks assignee_id=neq.me is empty'), async () => denied(await me.c.from('tasks').select('*').neq('assignee_id', me.id)));
  await check(T('tasks or(...) filter cannot widen'), async () => denied(await me.c.from('tasks').select('*').or('assignee_id.eq.' + other.id + ',author_id.eq.' + other.id)));
  await check(T('other task by id is invisible'), async () => denied(await me.c.from('tasks').select('*').eq('id', theirs[0]!.id)));
  await check(T('exact count equals own count'), async () => {
    const r = await me.c.from('tasks').select('*', { count: 'exact', head: true });
    return r.count === mine.length ? true : 'count ' + r.count + ' != ' + mine.length;
  });
  await check(T('sites visible == sites of own tasks'), async () => {
    const got = rows<{ id: number }>(await me.c.from('sites').select('*')).map((s) => s.id).sort((a, b) => a - b);
    const want = siteIdsOf(mine);
    return JSON.stringify(got) === JSON.stringify(want) ? true : 'got ' + got + ' want ' + want;
  });
  await check(T('embed sites?select=*,tasks(*) leaks no foreign tasks'), async () => {
    const r = await me.c.from('sites').select('*, tasks(*)');
    if (r.error) return 'error ' + r.error.message;
    const leaked = rows<{ tasks: TaskRow[] }>(r).flatMap((s) => s.tasks).filter((t) => t.assignee_id !== me.id);
    return leaked.length === 0 ? true : 'LEAK: ' + leaked.length + ' foreign tasks: ' + leaked.map((t) => t.id);
  });
  await check(T('embed tasks?select=*,sites(*),task_status_history(*) leaks nothing foreign'), async () => {
    const r = await me.c.from('tasks').select('*, sites(*), task_status_history(*)');
    if (r.error) return 'error ' + r.error.message;
    const data = rows<TaskRow & { task_status_history: { task_id: number }[] }>(r);
    const bad = data.flatMap((t) => t.task_status_history).filter((h) => !myIds.has(h.task_id));
    return data.every((t) => t.assignee_id === me.id) && bad.length === 0 ? true : 'LEAK ' + JSON.stringify(bad).slice(0, 120);
  });
  await check(T('embed profiles?select=*,tasks(*) leaks no foreign tasks'), async () => {
    const r = await me.c.from('profiles').select('*, tasks!tasks_assignee_id_fkey(*)');
    if (r.error) return 'error ' + r.error.message;
    const leaked = rows<{ tasks: TaskRow[] }>(r).flatMap((p) => p.tasks).filter((t) => t.assignee_id !== me.id);
    return leaked.length === 0 ? true : 'LEAK ' + leaked.length + ' foreign tasks';
  });
  await check(T('embed history->profiles never exposes the other assignee'), async () => {
    const r = await me.c.from('task_status_history').select('*, profiles(*)');
    if (r.error) return 'error ' + r.error.message;
    const hit = rows<{ actor_id: string }>(r).filter((h) => h.actor_id === other.id);
    return hit.length === 0 ? true : 'other assignee appears as actor in ' + hit.length + ' rows';
  });
  await check(T('history of other task is invisible'), async () => denied(await me.c.from('task_status_history').select('*').eq('task_id', theirs[0]!.id)));
  await check(T('history rows only for own tasks'), async () => {
    const bad = rows<{ task_id: number }>(await me.c.from('task_status_history').select('task_id')).filter((h) => !myIds.has(h.task_id));
    return bad.length === 0 ? true : 'LEAK ' + bad.length + ' foreign history rows';
  });
}

async function assigneeMisc(name: string, me: Actor, other: Actor): Promise<void> {
  const T = (s: string) => 'C ' + name + ' ' + s;
  await check(T('profiles enumeration hides the other assignee, no contact columns'), async () => {
    const list = rows<Record<string, unknown>>(await me.c.from('profiles').select('*'));
    if (list.some((p) => p.id === other.id)) return 'LEAK: other assignee profile visible';
    if (list.some((p) => 'email' in p || 'phone' in p)) return 'LEAK: contact column present';
    return true;
  });
  await check(T('profiles?id=eq.<other> empty'), async () => denied(await me.c.from('profiles').select('*').eq('id', other.id)));
  await check(T('task_transitions unreadable'), async () => denied(await me.c.from('task_transitions').select('*')));
  await check(T('rpc is_manager returns false'), async () => {
    const r = await me.c.rpc('is_manager');
    return r.data === false ? true : 'got ' + JSON.stringify(r.data) + ' err ' + r.error?.message;
  });
  await check(T('rpc is_assignee_user(other uuid) role oracle (warn only)'), async () => {
    const r = await me.c.rpc('is_assignee_user', { p_id: other.id });
    if (!r.error) warn(T('is_assignee_user'), 'callable by any signed-in user, returns role-class of an arbitrary uuid (needs a known uuid; low impact)');
    return true;
  });
  for (const fn of ['tasks_before_insert', 'tasks_before_update', 'tasks_after_insert', 'exec_sql', 'pg_sleep']) {
    await check(T('rpc ' + fn + ' not callable'), async () => onlyError(await me.c.rpc(fn)));
  }
}

async function assigneeWrites(x: Ctx, name: string, me: Actor, other: Actor, mine: TaskRow[], theirs: TaskRow[]): Promise<void> {
  console.log('\n--- D. ' + name + ' (assignee): direct writes');
  const T = (s: string) => 'D ' + name + ' ' + s;
  const mineT = mine[0]!, theirT = theirs[0]!;
  const upd = (id: number, patch: Record<string, unknown>) => me.c.from('tasks').update(patch).eq('id', id).select('id');
  await check(T('PATCH own status=under_review denied'), async () => denied(await upd(mineT.id, { status: 'under_review' })));
  await check(T('PATCH own status=accepted denied'), async () => denied(await upd(mineT.id, { status: 'accepted' })));
  await check(T('PATCH own title denied'), async () => denied(await upd(mineT.id, { title: 'pwned' })));
  await check(T('PATCH own task assignee_id -> other denied'), async () => denied(await upd(mineT.id, { assignee_id: other.id })));
  await check(T('PATCH own task author_id denied'), async () => denied(await upd(mineT.id, { author_id: me.id })));
  await check(T('PATCH foreign task assignee_id -> me denied'), async () => denied(await upd(theirT.id, { assignee_id: me.id })));
  await check(T('PATCH foreign task title denied'), async () => denied(await upd(theirT.id, { title: 'pwned' })));
  await check(T('PATCH every task (no filter) denied'), async () => denied(await me.c.from('tasks').update({ description: 'pwned' }).gte('id', 0).select('id')));
  await check(T('DELETE own task denied'), async () => denied(await me.c.from('tasks').delete().eq('id', mineT.id).select('id')));
  await check(T('DELETE foreign task denied'), async () => denied(await me.c.from('tasks').delete().eq('id', theirT.id).select('id')));
  await check(T('DELETE all tasks (no filter) denied'), async () => denied(await me.c.from('tasks').delete().gte('id', 0).select('id')));
  await check(T('INSERT task for self denied'), async () => onlyError(await me.c.from('tasks').insert({ site_id: mineT.site_id, assignee_id: me.id, title: 'x' }).select('id')));
  await check(T('INSERT task with status=accepted/author=manager denied'), async () => onlyError(await me.c.from('tasks').insert({ site_id: mineT.site_id, assignee_id: me.id, title: 'x', status: 'accepted', author_id: x.manager.id }).select('id')));
  await check(T('UPSERT over foreign task id denied'), async () => denied(await me.c.from('tasks').upsert({ id: theirT.id, site_id: theirT.site_id, assignee_id: me.id, title: 'pwned' }).select('id')));
  await check(T('INSERT/PATCH/DELETE sites denied'), async () => {
    const a = await me.c.from('sites').insert({ name: 'x' }).select('id');
    const b = await me.c.from('sites').update({ name: 'pwned' }).eq('id', mineT.site_id).select('id');
    const c = await me.c.from('sites').delete().eq('id', mineT.site_id).select('id');
    return onlyError(a) === true && denied(b) === true && denied(c) === true ? true : 'BREACH: ' + JSON.stringify([a.data, b.data, c.data]);
  });
}

async function assigneeWrites2(x: Ctx, name: string, me: Actor, other: Actor, mine: TaskRow[]): Promise<void> {
  const T = (s: string) => 'D ' + name + ' ' + s;
  const mineT = mine[0]!;
  const prof = (patch: Record<string, unknown>, id: string) => me.c.from('profiles').update(patch).eq('id', id).select('id');
  await check(T('role escalation PATCH profiles denied'), async () => denied(await prof({ role: 'manager' }, me.id)));
  await check(T('PATCH own full_name denied'), async () => denied(await prof({ full_name: 'pwned' }, me.id)));
  await check(T('PATCH other profile denied'), async () => denied(await prof({ role: 'manager' }, other.id)));
  await check(T('INSERT profile role=manager denied'), async () => onlyError(await me.c.from('profiles').insert({ id: ZERO, full_name: 'x', role: 'manager' }).select('id')));
  await check(T('UPSERT own profile as manager denied'), async () => denied(await me.c.from('profiles').upsert({ id: me.id, full_name: 'x', role: 'manager' }).select('id')));
  await check(T('DELETE profile denied'), async () => denied(await me.c.from('profiles').delete().eq('id', me.id).select('id')));
  await check(T('INSERT forged history denied'), async () => onlyError(await me.c.from('task_status_history').insert({ task_id: mineT.id, actor_id: x.manager.id, from_status: 'under_review', to_status: 'accepted', comment: 'forged' }).select('id')));
  await check(T('PATCH history denied'), async () => denied(await me.c.from('task_status_history').update({ comment: 'forged' }).gte('id', 0).select('id')));
  await check(T('DELETE history denied'), async () => denied(await me.c.from('task_status_history').delete().gte('id', 0).select('id')));
  await check(T('task_transitions INSERT/PATCH/DELETE denied'), async () => {
    const a = await me.c.from('task_transitions').insert({ from_status: 'new', to_status: 'accepted', actor: 'assignee' }).select();
    const b = await me.c.from('task_transitions').update({ actor: 'assignee' }).eq('from_status', 'under_review').select();
    const c = await me.c.from('task_transitions').delete().gte('from_status', 'new').select();
    return onlyError(a) === true && denied(b) === true && denied(c) === true ? true : 'BREACH ' + JSON.stringify([a.data, b.data, c.data]);
  });
}

async function assigneeRpc(x: Ctx, name: string, me: Actor, mine: TaskRow[], theirs: TaskRow[]): Promise<void> {
  console.log('\n--- E. ' + name + ' (assignee): RPC abuse');
  const T = (s: string) => 'E ' + name + ' ' + s;
  const mineT = mine[0]!, theirT = theirs[0]!;
  const rpc = (id: unknown, to: unknown, comment: unknown = null, extra: Record<string, unknown> = {}) =>
    me.c.rpc('change_task_status', { p_task_id: id, p_new_status: to, p_comment: comment, ...extra } as never);
  for (const to of STATUSES) {
    await check(T('rpc on foreign task -> ' + to + ' rejected with "not found"'), async () => {
      const r = await rpc(theirT.id, to);
      if (!r.error) return 'BREACH: succeeded ' + JSON.stringify(r.data).slice(0, 120);
      return /not found/i.test(r.error.message) ? true : 'rejected, but message differs (existence oracle?): ' + r.error.message;
    });
  }
  await check(T('rpc on nonexistent id gives same message as foreign task'), async () => {
    const a = await rpc(999999999, 'in_progress'), b = await rpc(theirT.id, 'in_progress');
    return a.error && b.error && a.error.message === b.error.message ? true : 'a=' + a.error?.message + ' b=' + b.error?.message;
  });
  const legal = new Set(['new>in_progress', 'in_progress>under_review', 'needs_rework>in_progress']);
  let tried = 0; const breaches: string[] = [];
  for (const t of mine) for (const to of STATUSES) {
    if (legal.has(t.status + '>' + to)) continue;
    tried++;
    if (!(await rpc(t.id, to, 'x')).error) breaches.push('task ' + t.id + ' ' + t.status + '->' + to);
  }
  await check(T('all ' + tried + ' non-assignee transitions on own tasks rejected (skip states, accepted->*, self-accept)'), async () => (breaches.length ? 'BREACH: ' + breaches.join('; ') : true));
  await check(T('rpc invalid enum / null / bad types rejected'), async () => {
    const rs = await Promise.all([rpc(mineT.id, 'bogus'), rpc(mineT.id, null), rpc(null, 'in_progress'), rpc('abc', 'in_progress')]);
    return rs.every((r) => r.error) ? true : 'BREACH ' + JSON.stringify(rs.map((r) => r.data));
  });
  await check(T('rpc cannot spoof actor via extra param'), async () => onlyError(await rpc(mineT.id, 'accepted', null, { p_actor_id: x.manager.id })));
}

async function sectionManager(x: Ctx): Promise<void> {
  const { manager: m, alice, bob } = x;
  console.log('\n--- F. manager: bypass attempts');
  const find = (s: Status) => x.all.find((t) => t.status === s);
  const newTask = find('new'), reviewTask = find('under_review'), acceptedTask = find('accepted');
  const aT = x.aliceTasks[0]!;
  const upd = (id: number, patch: Record<string, unknown>) => m.c.from('tasks').update(patch).eq('id', id).select('id');
  const ins = (row: Record<string, unknown>) => m.c.from('tasks').insert(row).select('id');
  await check('F control: manager sees all tasks', async () => {
    const t = await m.c.from('tasks').select('*', { count: 'exact', head: true });
    return t.count === x.all.length && x.all.length > x.aliceTasks.length ? true : 'count ' + t.count;
  });
  const legal = new Set(['under_review>accepted', 'under_review>needs_rework']);
  let tried = 0; const breaches: string[] = [];
  for (const t of x.all) for (const to of STATUSES) {
    if (legal.has(t.status + '>' + to)) continue;
    tried++;
    if (!(await m.c.rpc('change_task_status', { p_task_id: t.id, p_new_status: to, p_comment: 'x' })).error) breaches.push('task ' + t.id + ' ' + t.status + '->' + to);
  }
  await check('F all ' + tried + ' illegal RPC transitions rejected (incl. manager doing assignee moves)', async () => (breaches.length ? 'BREACH: ' + breaches.join('; ') : true));
  if (reviewTask) {
    const blanks: [string, string | null][] = [['null', null], ['empty', ''], ['spaces', '   '], ['tab+newline', '\t\n'], ['CRLF/FF/VT', '\r\n\f\v'], ['mixed ws', ' \t \n ']];
    for (const [label, c] of blanks) {
      await check('F rework with ' + label + ' comment rejected', async () => onlyError(await m.c.rpc('change_task_status', { p_task_id: reviewTask.id, p_new_status: 'needs_rework', p_comment: c })));
    }
    await check('F rework with comment param omitted rejected', async () => onlyError(await m.c.rpc('change_task_status', { p_task_id: reviewTask.id, p_new_status: 'needs_rework' })));
    skip('F rework with NBSP/zero-width-only comment', 'fixed in 0006 (Unicode-blank check); skipped here because a regression would mutate live data. Covered by db:verify in a rolled-back transaction');
    await check('F reassign task under review rejected', async () => denied(await upd(reviewTask.id, { assignee_id: reviewTask.assignee_id === alice.id ? bob.id : alice.id })));
  } else skip('F blank-comment + under_review cases', 'no under_review task in seed');
  if (newTask) {
    for (const to of STATUSES.filter((s) => s !== 'new')) {
      await check('F direct PATCH status new->' + to + ' denied', async () => denied(await upd(newTask.id, { status: to })));
    }
    await check('F reassign task to a manager rejected', async () => denied(await upd(newTask.id, { assignee_id: m.id })));
  } else skip('F direct status PATCH', 'no new task in seed');
  if (acceptedTask) await check('F edit accepted task is frozen', async () => denied(await upd(acceptedTask.id, { title: 'pwned' })));
  await check('F PATCH status on ALL tasks denied', async () => denied(await m.c.from('tasks').update({ status: 'accepted' }).gte('id', 0).select('id')));
  await check('F PATCH author_id / created_at denied', async () => {
    const a = await upd(aT.id, { author_id: alice.id }), b = await upd(aT.id, { created_at: '2000-01-01' });
    return onlyError(a) === true && onlyError(b) === true ? true : 'BREACH ' + JSON.stringify([a.data, b.data]);
  });
  const base = { site_id: aT.site_id, assignee_id: alice.id, title: 'x' };
  await check('F INSERT task with status=accepted / foreign author denied', async () => onlyError(await ins({ ...base, status: 'accepted', author_id: alice.id })));
  await check('F INSERT task with explicit id denied', async () => onlyError(await ins({ ...base, id: 987654321 })));
  await check('F INSERT task assigned to a manager rejected', async () => onlyError(await ins({ ...base, assignee_id: m.id })));
  await check('F INSERT task assigned to unknown uuid rejected', async () => onlyError(await ins({ ...base, assignee_id: ZERO })));
  await check('F INSERT task with blank title rejected', async () => onlyError(await ins({ ...base, title: '   ' })));
  await check('F INSERT task null title / bad site rejected', async () => {
    const a = await ins({ ...base, title: null }), b = await ins({ ...base, site_id: 999999999 });
    return onlyError(a) === true && onlyError(b) === true ? true : 'BREACH ' + JSON.stringify([a.data, b.data]);
  });
}

async function sectionManager2(x: Ctx): Promise<void> {
  const { manager: m, alice } = x;
  const aT = x.aliceTasks[0]!;
  await check('F history INSERT denied', async () => onlyError(await m.c.from('task_status_history').insert({ task_id: aT.id, actor_id: m.id, from_status: 'new', to_status: 'accepted', comment: 'forged' }).select('id')));
  await check('F history PATCH denied', async () => denied(await m.c.from('task_status_history').update({ comment: 'forged' }).gte('id', 0).select('id')));
  await check('F history DELETE denied', async () => denied(await m.c.from('task_status_history').delete().gte('id', 0).select('id')));
  await check('F task_transitions read/write denied', async () => {
    const a = await m.c.from('task_transitions').select('*');
    const b = await m.c.from('task_transitions').update({ actor: 'assignee' }).gte('from_status', 'new').select();
    const c = await m.c.from('task_transitions').insert({ from_status: 'new', to_status: 'accepted', actor: 'manager' }).select();
    return denied(a) === true && denied(b) === true && onlyError(c) === true ? true : 'BREACH ' + JSON.stringify([a.data, b.data, c.data]);
  });
  await check('F profile role PATCH / INSERT denied', async () => {
    const a = await m.c.from('profiles').update({ role: 'assignee' }).eq('id', m.id).select('id');
    const b = await m.c.from('profiles').update({ role: 'manager' }).eq('id', alice.id).select('id');
    const c = await m.c.from('profiles').insert({ id: ZERO, full_name: 'x', role: 'manager' }).select('id');
    return denied(a) === true && denied(b) === true && onlyError(c) === true ? true : 'BREACH ' + JSON.stringify([a.data, b.data, c.data]);
  });
  await check('F site PATCH created_at / id denied (column grants)', async () => {
    const a = await m.c.from('sites').update({ created_at: '2000-01-01' }).eq('id', aT.site_id).select('id');
    const b = await m.c.from('sites').update({ id: 987654 }).eq('id', aT.site_id).select('id');
    return onlyError(a) === true && onlyError(b) === true ? true : 'BREACH ' + JSON.stringify([a.data, b.data]);
  });
  await check('F DELETE site that still has tasks rejected (FK RESTRICT)', async () => onlyError(await m.c.from('sites').delete().eq('id', aT.site_id).select('id')));
  await check('F manager direct DELETE task denied (soft delete only)', async () => onlyError(await m.c.from('tasks').delete().eq('id', aT.id).select('id')));
  await check('F assignee rpc delete_task denied', async () => onlyError(await x.alice.c.rpc('delete_task', { p_task_id: aT.id })));
  skip('F manager rpc delete_task archives task, keeps history', 'mutates live data; covered by db:verify in a rolled-back transaction');

  console.log('\n--- G. role not derived from user_metadata');
  await check('G alice sets user_metadata.role=manager, gains nothing, metadata restored', async () => {
    const orig = (await x.alice.c.auth.getUser()).data.user?.user_metadata ?? {};
    const hadRole = Object.prototype.hasOwnProperty.call(orig, 'role');
    const up = await x.alice.c.auth.updateUser({ data: { role: 'manager' } });
    try {
      if (up.error) return true;
      const tasks = rows<TaskRow>(await x.alice.c.from('tasks').select('*'));
      const mgr = await x.alice.c.rpc('is_manager');
      const leaked = tasks.some((t) => t.assignee_id !== x.alice.id);
      return !leaked && mgr.data === false ? true : 'BREACH: metadata role honoured';
    } finally {
      await x.alice.c.auth.updateUser({ data: { role: hadRole ? orig.role : null } });
    }
  });
}

async function main(): Promise<void> {
  const [manager, alice, bob] = await Promise.all([login('manager'), login('alice'), login('bob')]);
  const anon = fresh();
  const before = await snapshot(manager.c);
  const all = rows<TaskRow>(await manager.c.from('tasks').select('*').order('id'));
  const aliceTasks = all.filter((t) => t.assignee_id === alice.id);
  const bobTasks = all.filter((t) => t.assignee_id === bob.id);
  console.log('seed: ' + all.length + ' tasks (alice ' + aliceTasks.length + ', bob ' + bobTasks.length + ')\n');
  if (aliceTasks.length === 0 || bobTasks.length === 0) throw new Error('seed missing: both assignees need tasks');
  const x: Ctx = { manager, alice, bob, anon, all, aliceTasks, bobTasks };

  await sectionAnonAndForged(x);
  for (const [name, me, other, mine, theirs] of [
    ['alice', alice, bob, aliceTasks, bobTasks], ['bob', bob, alice, bobTasks, aliceTasks],
  ] as const) {
    await assigneeReads(name, me, other, mine, theirs);
    await assigneeMisc(name, me, other);
    await assigneeWrites(x, name, me, other, mine, theirs);
    await assigneeWrites2(x, name, me, other, mine);
    await assigneeRpc(x, name, me, mine, theirs);
  }
  await sectionManager(x);
  await sectionManager2(x);

  console.log('\n--- H. integrity');
  await check('H manager snapshot (tasks, sites, profiles, history) identical before/after the whole run', async () =>
    (await snapshot(manager.c)) === before ? true : 'DATA CHANGED during the attack run: some attack mutated data (see BREACH lines)');

  console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped, ' + warnings.length + ' warnings');
  if (warnings.length) console.log('warnings:\n  - ' + warnings.join('\n  - '));
  console.log('MANUAL: confirm in the dashboard that "Allow new users to sign up" and "Anonymous sign-ins" are OFF (not tested here: would create real users).');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('attack suite aborted:', (e as Error).message); process.exit(2); });
