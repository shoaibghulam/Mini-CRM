# Security audit checklist: Mini-CRM (React + TS + Supabase)

Attacker model: holds the public anon key, the project URL, and a valid JWT of an ordinary assignee (A1; A2 is another assignee, M is a manager). They bypass the UI and talk to PostgREST (`/rest/v1`), RPC (`/rest/v1/rpc`) and GoTrue (`/auth/v1`) directly.

Assumed design (adjust names to the real schema): tables `profiles(id, role, ...)`, `sites`, `tasks(assignee_id, author_id, status, ...)`, `task_status_history`. Status changes go through one RPC `change_task_status(p_task_id, p_new_status, p_comment)`. A BEFORE UPDATE trigger on `tasks` is the second line of defence.

## 1. Threat model: the 6 spec requirements

| # | Requirement | How the attacker tries to break it | What must stop it |
|---|---|---|---|
| 1 | Access enforced by RLS, not UI | `curl $URL/rest/v1/tasks?select=* -H "apikey: $ANON" -H "Authorization: Bearer $A1_JWT"`, repeated for `sites`, `profiles`, `task_status_history`. Also with only the anon key (no user JWT). | `ENABLE ROW LEVEL SECURITY` on every public table. Policies target `authenticated` only, so anon gets 0 rows or 401. Table grants revoked from `anon`. No `USING (true)` policies. |
| 2 | Assignee cannot read or modify others' tasks | A1 reads `tasks?assignee_id=eq.<A2>`. A1 PATCHes `tasks?id=eq.<A2 task>` with a new title. A1 PATCHes own task to change `assignee_id`, `title` or `site_id`. A1 DELETEs a task. | SELECT policy: `assignee_id = auth.uid() OR is_manager()`. Assignee has no UPDATE, DELETE or INSERT policy on `tasks`, so PATCH returns 0 rows (or 403 after a `REVOKE`). All assignee writes go via the RPC. |
| 3 | Transitions validated in the DB | `supabase.rpc('change_task_status', {...new_status:'accepted'})` on a `new` task. `PATCH tasks?id=eq.X {"status":"accepted"}` as manager and as assignee. Manager sends `needs_rework` with comment `null`, `''` or `'   '`. | Allowed pairs enforced in the DB (RPC and a `BEFORE UPDATE OF status` trigger). Role checked against `auth.uid()`, never a client-supplied value. Comment must be non-blank: ASCII and Unicode whitespace (NBSP, zero-width space, BOM, ideographic space, etc.) all count as blank (0006); max 2000 chars. Errors raised with `RAISE EXCEPTION`. |
| 4 | History cannot be forged, edited or deleted | `POST /rest/v1/task_status_history` with a fake row. `PATCH` or `DELETE task_status_history?...` as A1 and as M. RPC with a spoofed actor. | No INSERT, UPDATE or DELETE policies on `task_status_history`, plus `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM anon, authenticated`. Rows are written only by the SECURITY DEFINER function or trigger, with `actor = auth.uid()` taken server-side. |
| 5 | Public sign-up disabled | `supabase.auth.signUp({email, password})` or `POST /auth/v1/signup` with the anon key. Also `signInAnonymously()`. | Dashboard: Authentication > Providers > Email > "Allow new users to sign up" OFF. Anonymous sign-ins OFF. Expect an error such as "Signups not allowed". Users are created manually. |
| 6 | No secrets in frontend or repo | Search the built bundle for `service_role`. Check `git log -p`. Check Vercel env vars for `VITE_*SERVICE*`. | Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend. `.env` gitignored. Any key ever committed is rotated, not just deleted. |

## 2. Extra vectors a reviewer is likely to try

| Vector | Attack | Must happen |
|---|---|---|
| Reassign to self | A1: `PATCH tasks?id=eq.<other task> {"assignee_id":"<A1>"}` | 0 rows or 403. Task unchanged. |
| Direct status PATCH | A1: `PATCH tasks?id=eq.<own task> {"status":"in_progress"}` | 0 rows or 403. Only the RPC works. |
| Skip states | RPC `new -> accepted`, `new -> under_review`, `in_progress -> accepted`, `accepted -> anything` | Exception "invalid transition". No history row written. |
| Rework without comment | M: RPC `under_review -> needs_rework` with `null`, `''`, `'   '`, tab/newline only | Exception. Status unchanged. |
| Manager PATCH bypass | M: `PATCH tasks {"status":"accepted"}` on a `new` task | Trigger rejects it. RLS alone is not enough, since the manager passes RLS. |
| Fake history row | `POST task_status_history {task_id, from_status, to_status, actor_id}` | 401/403 (`42501`). |
| Delete or edit history | `DELETE` / `PATCH task_status_history` as A1 and as M | 0 rows or 403. `TRUNCATE` not granted. History FK is `ON DELETE RESTRICT` and tasks are archived (`deleted_at`) rather than deleted, so no task action removes history. |
| Enumerate users | A1: `GET profiles?select=*` | Only own row (or a minimal name-only view if the UI needs it). No emails or roles of others. |
| Role escalation | A1: `PATCH profiles?id=eq.<A1> {"role":"manager"}` | Must fail. Prefer no UPDATE policy plus `REVOKE UPDATE ON profiles FROM authenticated`. If self-edit is needed, restrict columns and add `WITH CHECK` that role is unchanged. Never store the role in `user_metadata` (user-editable); use `profiles` or `app_metadata`. |
| RPC on another's task | A1: RPC `change_task_status(<A2 task>, 'in_progress')` | Exception "not assigned" (or "not found"). RPC re-checks `assignee_id = auth.uid()`. |
| Anon key, no session | Every table GET/POST and RPC without a user bearer token | 0 rows or 401. `EXECUTE` on the RPC revoked from `anon` and `PUBLIC`. |
| Sign-up when disabled | `auth.signUp(...)` | Error, no user created. Check Auth > Users afterwards. |
| Empty sites leak | A1 reads `sites` | Only sites where A1 has at least one task. Site with zero tasks or only others' tasks is invisible. |
| Embedded relations | `sites?select=*,tasks(*)`, `tasks?select=*,sites(*),task_status_history(*)`, `profiles?select=*,tasks(*)` | RLS applies per table. `tasks(*)` shows only A1's tasks. History only for visible tasks. |
| SECURITY DEFINER hijack | Review every function with `SECURITY DEFINER` | Each has `SET search_path = ''` (or `public, pg_temp`) and schema-qualified names. `REVOKE EXECUTE ... FROM PUBLIC, anon`; `GRANT` to `authenticated` only. Helpers like `is_manager()` included. |
| Policy recursion | `sites` policy queries `tasks` and vice versa | Use SECURITY DEFINER helpers returning a boolean only. |
| Views | Views bypass RLS by default | `WITH (security_invoker = true)`, or no views. |
| Secret leakage | `service_role` in `VITE_*`, committed `.env`, README, seed scripts, screenshots | See section 4. Also `grep -r service_role dist/`. |
| Input abuse | Invalid enum, `status=null`, huge strings | Enum or `CHECK` constraints, `NOT NULL`, length limits. |

## 3. Verification plan

Create test users manually: `m1` (manager), `a1`, `a2` (assignees). Seed: site S1 (tasks for a1 and a2), S2 (only a2 tasks), S3 (no tasks), tasks in several statuses. Run against the deployed project, not local.

| # | Actor | Request | Expected |
|---|---|---|---|
| 1 | anon | `from('tasks').select()` | `[]` or error |
| 2 | anon | `from('profiles').select()` | `[]` or error |
| 3 | anon | `auth.signUp(new email)` | error, no user |
| 4 | a1 | `from('tasks').select()` | only `assignee_id = a1` rows |
| 5 | a1 | `from('sites').select('*, tasks(*)')` | only S1, only a1 tasks inside. No S2, no S3. |
| 6 | a1 | `from('tasks').update({assignee_id: a1}).eq('id', a2Task).select()` | 0 rows or error. Re-read as m1: unchanged. |
| 7 | a1 | `from('tasks').update({status:'in_progress'}).eq('id', a1NewTask).select()` | 0 rows or error. Status still `new`. |
| 8 | a1 | `rpc` on a2 task, to `in_progress` | error (not assigned) |
| 9 | a1 | `rpc` own `new -> accepted` | error (invalid transition) |
| 10 | a1 | `rpc` own `new -> in_progress` | OK. Exactly 1 history row, `actor = a1`. |
| 11 | a1 | `from('task_status_history').insert({...fake})` | error |
| 12 | a1, m1 | `task_status_history` `.delete()` and `.update()` | 0 rows or error. Row still exists. |
| 13 | m1 | `rpc` `under_review -> needs_rework` with `''`, `'   '`, `null` | error each time |
| 14 | m1 | `from('tasks').update({status:'accepted'}).eq('id', newTask)` | error (trigger). Unchanged. |
| 15 | a1 | `from('profiles').update({role:'manager'}).eq('id', a1)`, then read back | error or 0 rows. Role still `assignee`. |
| 16 | a1 | `from('profiles').select()` | own row only (or minimal columns) |
| 17 | a1 | `from('tasks').delete().eq('id', a1Task)` | 0 rows or error |
| 18 | m1 | `rpc` `under_review -> needs_rework` with `'fix the rebar'` | OK, history row stores the comment |

Skeleton (run with `tsx`, credentials from env, never committed):

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!   // anon key only, never service_role
const PASS = process.env.TEST_PASSWORD!

async function as(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PASS })
  if (error) throw error
  return c
}

let failed = 0
async function check(name: string, ok: () => Promise<boolean>) {
  try {
    const pass = await ok()
    if (!pass) failed++
    console.log((pass ? 'PASS  ' : 'FAIL  ') + name)
  } catch (e) { failed++; console.log('FAIL  ' + name, e) }
}
const denied = (r: { data: unknown; error: unknown }) =>
  !!r.error || (Array.isArray(r.data) && r.data.length === 0)

async function main() {
  const anon = createClient(URL, ANON)
  const m1 = await as('m1@test.dev')
  const a1 = await as('a1@test.dev')
  const a1Id = (await a1.auth.getUser()).data.user!.id
  const A2_TASK = process.env.A2_TASK_ID!
  const A1_NEW_TASK = process.env.A1_NEW_TASK_ID!

  await check('1 anon reads tasks', async () => denied(await anon.from('tasks').select()))
  await check('3 signUp disabled', async () =>
    !!(await anon.auth.signUp({ email: 'x' + Date.now() + '@test.dev', password: 'Passw0rd!x' })).error)
  await check('4 a1 sees only own tasks', async () => {
    const { data } = await a1.from('tasks').select('assignee_id')
    return !!data && data.every(r => r.assignee_id === a1Id)
  })
  await check('7 a1 direct status patch', async () =>
    denied(await a1.from('tasks').update({ status: 'in_progress' }).eq('id', A1_NEW_TASK).select()))
  await check('8 a1 rpc on foreign task', async () =>
    !!(await a1.rpc('change_task_status',
      { p_task_id: A2_TASK, p_new_status: 'in_progress', p_comment: null })).error)
  await check('11 a1 forges history', async () =>
    !!(await a1.from('task_status_history').insert({ task_id: A2_TASK, to_status: 'accepted' })).error)
  await check('13 m1 rework needs comment', async () =>
    !!(await m1.rpc('change_task_status',
      { p_task_id: process.env.REVIEW_TASK_ID!, p_new_status: 'needs_rework', p_comment: '   ' })).error)
  // ... add the remaining cases from the table

  console.log(failed ? failed + ' FAILED' : 'ALL PASSED')
  process.exit(failed ? 1 : 0)
}
main()
```

A PATCH that returns 0 rows may just mean RLS filtered it. That is fine, but always re-read the row as `m1` to prove nothing changed. Do this for every write test. Tests that succeed legitimately (case 10) mutate seed data, so reseed before the final run.

## 4. Pre-submission checklist

Supabase dashboard
- [ ] Authentication > Sign In / Providers > Email: "Allow new users to sign up" OFF. Anonymous sign-ins OFF. (Email confirmation is irrelevant for manually created users.)
- [ ] Other providers (Google, GitHub, etc.) OFF.
- [ ] Table Editor: RLS enabled on `profiles`, `sites`, `tasks`, `task_status_history` (no "RLS disabled" badge).
- [ ] Advisors > Security Advisor: zero errors (RLS disabled, SECURITY DEFINER views, mutable `search_path`). Fix warnings or list them in the decisions document.
- [ ] `select * from pg_policies where schemaname = 'public'`: no `USING (true)`, no policy for `anon` or `public`.
- [ ] `select proname, prosecdef, proconfig from pg_proc ...`: every SECURITY DEFINER function has `search_path` set.
- [ ] Grants reviewed: `anon` has nothing on app tables. `authenticated` has no INSERT/UPDATE/DELETE on `task_status_history` and no UPDATE on `profiles`.
- [ ] API settings: exposed schemas only `public`.
- [ ] Test users exist (1 manager, 2 assignees), roles stored in `profiles`, not user-editable metadata.
- [ ] Section 3 script passes against the deployed URL, rerun after the last migration.

Repository
- [ ] `.env` and `.env.*` (except `.env.example`) in `.gitignore`.
- [ ] `.env.example` has placeholders only: `VITE_SUPABASE_URL=https://your-project.supabase.co`, `VITE_SUPABASE_ANON_KEY=your-anon-key`.
- [ ] `git log -p --all | grep -iE "service_role|sb_secret"` finds nothing. If a secret ever appears, rotate it in Supabase and rewrite or recreate the history.
- [ ] `grep -riE "service_role|sb_secret" src/ supabase/ README.md` is clean. Seed SQL and README contain no real passwords (send logins in the chat message only).
- [ ] Schema, RLS, grants, functions, triggers are all in `supabase/migrations/`, so a reviewer can reproduce them.

Vercel
- [ ] Env vars: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Nothing like `*SERVICE*`, `*SECRET*`, `DATABASE_URL`.
- [ ] Anything prefixed `VITE_` ships to the browser, so treat it as public.
- [ ] After deploy: `grep -r service_role dist/` and view-source on the live site show no secret.

## 5. What I will say on the call

The anon key is public by design: it only identifies my project and ships in every Supabase frontend, like a street address. On its own it grants no data access, because every request is checked inside Postgres against the caller identity from the JWT. The real protection lives in the database: Row Level Security decides which rows each user sees, and a trigger plus a SECURITY DEFINER function decide which status changes are legal. So even if someone calls the REST API with curl and skips my UI, the same rules apply. The only dangerous key is `service_role`, which bypasses RLS, and it is never in the frontend, the repo or Vercel. I checked all this with a script that signs in as each role and tries to break every rule against the deployed project.
