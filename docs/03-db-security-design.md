# DB and Security Design (Supabase / PostgreSQL)

Design of the Mini-CRM "Sites and Tasks" database as it is implemented. The rules live in `supabase/migrations/0001..0006`; this document describes what those files produce. §11 lists the migrations and why 0006 exists.

## 0. Principles (the whole design in 7 lines)

1. Role comes from the `profiles` table, never from `user_metadata` (a user can edit that themselves).
2. Deny by default: revoke everything, then grant the minimum, then add RLS policies.
3. RLS decides which rows a user sees. Column grants decide which columns they may write.
4. `status` is never written directly by a client. Only the RPC `change_task_status` writes it.
5. History has no write path for clients and cannot be deleted through the API. Only the RPC and the creation trigger write it.
6. Nothing is hard-deleted through the API. A manager's "delete" archives a task (`deleted_at`). Its history stays.
7. Functions that run with owner rights (`SECURITY DEFINER`) have an empty `search_path`, so they cannot be hijacked and cannot recurse through RLS.

## 1. Schema

```sql
create type public.user_role   as enum ('manager', 'assignee');
create type public.task_status as enum
  ('new', 'in_progress', 'under_review', 'accepted', 'needs_rework');
```

| Table | Column | Type | Constraints |
|---|---|---|---|
| profiles | id | uuid | PK, FK `auth.users(id)` ON DELETE CASCADE |
| | full_name | text | not null, `length(btrim(full_name)) > 0`, `char_length <= 200` |
| | role | user_role | not null |
| | created_at | timestamptz | not null, default `now()` |
| sites | id | bigint identity | PK, clients cannot choose it |
| | name | text | not null, `length(btrim(name)) > 0`, `char_length <= 200` |
| | address | text | not null, default `''`, `char_length <= 500` |
| | created_at | timestamptz | not null, default `now()` |
| tasks | id | bigint identity | PK |
| | site_id | bigint | not null, FK sites (RESTRICT) |
| | assignee_id | uuid | not null, FK profiles (RESTRICT) |
| | author_id | uuid | not null, FK profiles (RESTRICT). Forced to `auth.uid()` on insert |
| | title | text | not null, `length(btrim(title)) > 0`, `char_length <= 200` |
| | description | text | not null, default `''`, `char_length <= 5000` |
| | status | task_status | not null, default `'new'`. Written only by `change_task_status()` |
| | created_at | timestamptz | not null, default `now()`. Forced by the insert trigger |
| | deleted_at | timestamptz | null = live. Set only by `delete_task()` |
| | deleted_by | uuid | null, FK profiles (RESTRICT). Set only by `delete_task()` |
| task_status_history | id | bigint identity | PK |
| | task_id | bigint | not null, FK tasks (RESTRICT) |
| | actor_id | uuid | not null, FK profiles (RESTRICT) |
| | from_status | task_status | null. NULL = the creation row ("-" -> new) |
| | to_status | task_status | not null |
| | comment | text | null. Trimmed, NULL when empty, `char_length <= 2000` |
| | created_at | timestamptz | not null, default `now()` |

The transition table is the single source of truth for the state machine. One row per legal move; anything not listed is forbidden.

| from_status | to_status | actor | comment_required |
|---|---|---|---|
| new | in_progress | assignee | no |
| in_progress | under_review | assignee | no |
| under_review | accepted | manager | no |
| under_review | needs_rework | manager | **yes** |
| needs_rework | in_progress | assignee | no |

Indexes (section 7) cover every FK column and every column used in an RLS policy.

Decisions:
- `assignee_id` is NOT NULL: every task has an assignee (the manager assigns on create).
- `bigint identity` for ids. `text` and `timestamptz` everywhere.
- Free text is capped by CHECK constraints (migration 0006, M3), so the database refuses oversized input whatever the client sends.
- No email in `profiles`. The login system owns it.

### Foreign keys and on-delete behaviour

| FK | Behaviour | Why |
|---|---|---|
| `tasks.site_id -> sites` | RESTRICT | Deleting a site that has tasks, live or archived, fails with 23503. The manager must move or remove the tasks first. |
| `tasks.assignee_id -> profiles` | RESTRICT | Never orphan work. |
| `tasks.author_id -> profiles` | RESTRICT | Never lose who created a task. |
| `tasks.deleted_by -> profiles` | RESTRICT | Never lose who archived a task. |
| `task_status_history.task_id -> tasks` | RESTRICT | History is never removed by deleting its task. Changed from CASCADE in 0006 (M1). |
| `task_status_history.actor_id -> profiles` | RESTRICT | Never lose "who did it". Deactivate a user instead of deleting. |
| `profiles.id -> auth.users` | CASCADE | A profile has no meaning without its login. Deleting a login that still has work behind it is blocked by the RESTRICT keys above. |

Honest limitation to state on the call: archived tasks stay in the table. A database owner with SQL access could delete them deliberately. The API cannot, and there is no un-archive action yet.

## 2. Helper functions

Migration 0002, with the 0006 grant changes below.

```sql
create function public.is_manager() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'manager'
  );
$$;

create function public.is_assignee_user(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_id and role = 'assignee');
$$;
```

- `is_manager()`: EXECUTE for `authenticated` only. The RLS policies call it as the client.
- `is_assignee_user(uuid)`: no client EXECUTE (0006, L1). Only the definer triggers in section 4 call it. No RLS policy uses it.
- Both are revoked from `PUBLIC` and `anon`.

Why SECURITY DEFINER avoids RLS recursion: the `profiles` SELECT policy itself needs to know "is this user a manager?". If that check were a normal query on `profiles`, it would trigger the same policy again and loop forever. A definer function runs as the owner (`postgres`), which bypasses RLS, so it reads `profiles` directly with no policy evaluation.

Why `set search_path = ''`: a definer function runs with owner rights. With a normal search_path an attacker could create a look-alike object in a schema they control and have it run with those rights. An empty path forces fully qualified names (`public.profiles`). `STABLE` lets Postgres cache the result within a statement, and `(select auth.uid())` makes it an init-plan evaluated once, not per row.

## 3. RLS policies

RLS is enabled on all five tables. Every policy is `to authenticated`. `anon` has no grants and no policies.

```sql
alter table public.profiles            enable row level security;
alter table public.sites               enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_status_history enable row level security;
alter table public.task_transitions    enable row level security;  -- no policies: invisible
```

### profiles (read-only through the API)

| Cmd | Manager | Assignee |
|---|---|---|
| SELECT | all rows (needed for the assignee dropdown) | self; authors of their live tasks; actors in the history of their live tasks |
| INSERT / UPDATE / DELETE | none | none |

```sql
create policy profiles_select on public.profiles for select to authenticated
using (
  public.is_manager()
  or id = (select auth.uid())
  or exists (select 1 from public.tasks t
             where t.assignee_id = (select auth.uid()) and t.author_id = profiles.id)
  or exists (select 1 from public.task_status_history h
             join public.tasks t on t.id = h.task_id
             where t.assignee_id = (select auth.uid()) and h.actor_id = profiles.id)
);
```

No write policies and no write grants: nobody can change their own `role` or insert a fake profile. Profiles are created with SQL after the Auth user exists.

The `tasks` and history policies never read `profiles` directly (only `is_manager()`, which bypasses RLS), so there is no cycle. The subqueries above run under `tasks` RLS, so archived tasks do not expose their authors.

### sites

| Cmd | Manager | Assignee |
|---|---|---|
| SELECT | all | only sites where they have at least one live task |
| INSERT | yes | none |
| UPDATE | yes (grant limits it to name, address) | none |
| DELETE | policy allows managers. Still blocked by RESTRICT while any task refers to the site | none |

### tasks

| Cmd | Manager | Assignee |
|---|---|---|
| SELECT | live tasks | live tasks with `assignee_id = me` |
| INSERT | yes (status, author, created_at forced by trigger) | none |
| UPDATE | live tasks only. Content columns only (site, assignee, title, description). Never `status`, `deleted_at`, `deleted_by` | none (status goes through the RPC) |
| DELETE | **no policy and no grant.** Use `delete_task()` | none |

```sql
create policy tasks_select on public.tasks for select to authenticated
using (deleted_at is null and (public.is_manager() or assignee_id = (select auth.uid())));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_manager());
create policy tasks_update on public.tasks for update to authenticated
  using (deleted_at is null and public.is_manager())
  with check (deleted_at is null and public.is_manager());
```

### task_status_history

| Cmd | Manager | Assignee |
|---|---|---|
| SELECT | history of live tasks | history of their live tasks |
| INSERT / UPDATE / DELETE | none | none |

```sql
-- The subquery on tasks is itself filtered by tasks RLS: one source of truth.
create policy history_select on public.task_status_history for select to authenticated
using (exists (select 1 from public.tasks t where t.id = task_status_history.task_id));
```

Because the history, sites and profiles policies look at tasks through the tasks policy, an archived task's history and any site seen only through it disappear from the API with it.

## 4. Status transitions and task triggers

### 4.1 change_task_status

```
change_task_status(p_task_id bigint, p_new_status public.task_status, p_comment text default null) returns public.tasks
```

`SECURITY DEFINER`, `search_path = ''`, EXECUTE for `authenticated` only. It is the only door for status changes. It checks, in this order:

| # | Check | Error | SQLSTATE |
|---|---|---|---|
| 1 | `auth.uid()` is not null | not authenticated | 28000 |
| 2 | the caller has a `profiles` row | no profile | 42501 |
| 3 | the task exists, is not archived, and (for an assignee) is assigned to the caller. Row is locked `FOR UPDATE` | task not found | P0002 |
| 4 | a row exists in `task_transitions` for (current status, new status) | transition X -> Y is not allowed | 23514 |
| 5 | the caller's role matches the transition's actor, and for assignee moves the caller is the assigned assignee | not allowed for your role | 42501 |
| 6 | if `comment_required`, the comment is not empty | comment is required | 23514 |
| 7 | the comment is at most 2000 characters | comment is too long | 23514 |

Then it updates `status`, inserts one history row (actor from `auth.uid()`, the from/to statuses, the comment) and returns the task.

Comment handling: the stored comment is trimmed of ASCII whitespace at both ends. A comment made only of blanks (spaces, tabs, newlines, NBSP, zero-width space and similar) is stored as NULL. The one-argument `btrim()` only strips spaces, which is why the trim uses an explicit character set. A comment is stored on any move if it is provided, and is required only for `needs_rework`.

A manager cannot make assignee moves, because the spec says the assigned assignee does the work. The frontend calls `supabase.rpc('change_task_status', {...})`.

Why SECURITY DEFINER here: the function must write status and history, which clients may not. RLS does not apply inside it, so it re-checks visibility and role itself. The row lock means two simultaneous clicks queue up: the second waits, then fails check 4 against the new status.

### 4.2 delete_task

```
delete_task(p_task_id bigint) returns void
```

```sql
create function public.delete_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'manager') then
    raise exception 'not allowed for your role' using errcode = '42501';
  end if;
  update public.tasks set deleted_at = now(), deleted_by = v_uid
   where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
end $$;
```

It archives; it never removes. A missing task and an already archived task give the same answer (P0002). Accepted tasks can be archived. EXECUTE for `authenticated` only.

| Case | Error | SQLSTATE |
|---|---|---|
| no session | not authenticated | 28000 |
| caller is not a manager (assignees and users without a profile) | not allowed for your role | 42501 |
| task missing or already archived | task not found | P0002 |

### 4.3 Triggers on tasks

| Trigger | Timing | Function | Security | What it does |
|---|---|---|---|---|
| `tasks_bi` | BEFORE INSERT | `tasks_before_insert()` | DEFINER | Forces status `'new'`, `author_id = auth.uid()`, `created_at = now()`, `deleted_at` and `deleted_by` NULL. Assignee must have role assignee (23514). |
| `tasks_ai` | AFTER INSERT | `tasks_after_insert()` | DEFINER | Writes the creation history row: from NULL to `new`, actor = author. |
| `tasks_bu` | BEFORE UPDATE | `tasks_before_update()` | INVOKER | Status guard, author and created_at immutable, archive rules, frozen accepted tasks, no reassignment under review. Details below. |
| `tasks_bu_assignee` | BEFORE UPDATE OF assignee_id (only when it changes) | `tasks_check_assignee()` | DEFINER | New assignee must have role assignee (23514). |

`tasks_before_update` rules, in the order the function checks them:
1. Row already archived: raise P0002. Archived rows are frozen.
2. Archiving (`deleted_at` becomes non-NULL): raise 42501 if the caller is `authenticated` or `anon`, i.e. a client trying to set it directly. The owner context used by `delete_task()` passes. Site, assignee, title, description and status must not change (23514). Accepted tasks may be archived.
3. Client changes `status`: raise 42501 (`status can only be changed via change_task_status()`).
4. `author_id` or `created_at` changed: raise 42501.
5. Row is `accepted`: raise 23514 (frozen).
6. Assignee changed while `under_review`: raise 23514.

It is SECURITY INVOKER on purpose: `current_user` is the real caller. Inside the RPC or `delete_task()` it is the owner, so they pass. A direct client UPDATE does not.

Trigger functions are not callable as RPCs by anyone. Triggers still fire, because EXECUTE is checked when the trigger is created.

Layers that stop a manager changing `status` directly: (1) the column grant (section 6) returns `permission denied`; (2) the trigger raises even if the grant is widened by mistake; (3) the RPC is the only path that runs with owner rights and checks the transition.

## 5. History immutability

- No INSERT, UPDATE or DELETE policy and no such grant for `authenticated` or `anon`. Either alone is enough; both together are belt and braces.
- Writers: `change_task_status()` (RPC, definer) and `tasks_after_insert` (trigger, definer). Both run as the owner.
- Rows are never removed through the API. Archiving is a soft delete, and the history FK is RESTRICT, so no task deletion can cascade into history.

```sql
create function public.tasks_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_status_history (task_id, actor_id, from_status, to_status)
  values (new.id, new.author_id, null, 'new');
  return new;
end $$;
create trigger tasks_ai after insert on public.tasks
  for each row execute function public.tasks_after_insert();
```

## 6. Grants

Supabase grants broad default privileges to `anon` and `authenticated` on new `public` objects, so migration 0005 revokes everything and then grants the minimum. Migration 0001 and 0005 also set `alter default privileges` so objects created later start with nothing. 0006 adds a global `alter default privileges revoke execute on functions from public`, because the per-schema form cannot remove PUBLIC's built-in EXECUTE.

| Role | Object | Privileges |
|---|---|---|
| anon | everything | none. Schema `public` USAGE revoked (PUBLIC keeps USAGE on Supabase; harmless, see §11) |
| authenticated | schema `public` | USAGE |
| authenticated | `profiles`, `task_status_history` | SELECT |
| authenticated | `sites` | SELECT, DELETE, INSERT (name, address), UPDATE (name, address) |
| authenticated | `tasks` | SELECT, INSERT (site_id, assignee_id, title, description), UPDATE (site_id, assignee_id, title, description). **No DELETE** (revoked in 0006) |
| authenticated | `task_transitions` | none. Reached only through the definer RPC |
| authenticated | `is_manager()`, `change_task_status(...)`, `delete_task(bigint)` | EXECUTE |
| authenticated | `is_assignee_user()`, all trigger functions | none |
| PUBLIC, anon | all functions | none |

Column grants mean a client that sends `status`, `author_id`, `created_at`, `deleted_at`, `deleted_by` or `id` in an INSERT or UPDATE gets `permission denied` before RLS runs. Identity columns need no sequence privileges, so none are granted.

Auth settings (dashboard, not SQL): disable "Allow new users to sign up". Create users manually with "Auto confirm", then insert their `profiles` row (seed SQL). Only the anon/publishable key goes in the frontend `.env`. `service_role` is never used by the app and never committed.

## 7. Indexes

```sql
create index tasks_assignee_id_idx on public.tasks (assignee_id);  -- RLS predicate, My Tasks
create index tasks_site_id_idx     on public.tasks (site_id);      -- site card, sites policy, FK
create index tasks_author_id_idx   on public.tasks (author_id);    -- FK, profiles policy
create index tasks_deleted_by_idx  on public.tasks (deleted_by);   -- FK
create index history_task_id_idx   on public.task_status_history (task_id, id);  -- history, RLS
create index history_actor_id_idx  on public.task_status_history (actor_id);     -- FK, profiles policy
```

`profiles.id` is the primary key, already indexed. Tables are tiny here, but indexing every FK and every RLS column is the habit worth showing.

## 8. Edge cases (decisions)

| Case | Decision | Mechanism |
|---|---|---|
| Manager reassigns mid-work | Allowed in `new`, `in_progress`, `needs_rework`. Blocked in `under_review` and `accepted`. Status does not change. New assignee must have role assignee. Reassignment is not recorded in history (not finished). | `tasks_bu`, `tasks_bu_assignee` |
| Manager edits an accepted task | Frozen: content cannot change. Archiving is still allowed. | `tasks_bu` |
| Manager edits title or description | Works. Status, author, created_at cannot change. | column grants plus trigger |
| Delete a site that has tasks | Rejected with 23503, live or archived tasks alike. The UI tells the manager to move or remove the tasks first. | `ON DELETE RESTRICT` |
| Delete a task | `delete_task()` archives it: `deleted_at` and `deleted_by` are set, it disappears from every list, its history stays. A second delete returns "task not found". | soft delete, `tasks_select` / `tasks_update` |
| Direct `DELETE` on a task (API) | Not granted: permission denied. | no DELETE grant, no policy |
| Hard delete of a task that has history (SQL) | Refused by the RESTRICT FK. | `task_status_history_task_id_fkey` |
| Client sends `status`, `author_id`, `created_at`, `deleted_at` | Permission denied before any row is touched. | column grants |
| Assign a user whose role is manager | Rejected (23514). | `tasks_bi`, `tasks_bu_assignee` |
| Manager is also an assignee | No. One role per user (enum on `profiles`). Need a second persona? Create a second login. | enum plus trigger |
| Comment is only whitespace, including tab, newline or NBSP | Treated as "no comment" (NULL). | RPC trim plus Unicode-blank test |
| Comment longer than 2000 characters | Rejected with 23514 before anything is written. | RPC check 7, `history_comment_len` |
| Two requests change one task at once | Second waits on the row lock, then fails the transition check against the new status. | `for update` in RPC |
| Auth user without a `profiles` row | Sees nothing, and the RPC raises "no profile". | RLS plus RPC |
| Assignee guesses another task id | Select returns 0 rows; RPC says "task not found" (same answer as a missing or archived task). | RLS plus RPC check |

## 9. Verification checklist (direct API calls, run as each user)

1. Assignee `select` on tasks returns only their own live rows. Sites only those with their live tasks.
2. Assignee `update tasks set title=...` fails or affects 0 rows.
3. Assignee `update tasks set status='accepted'` fails.
4. Manager `update tasks set status='accepted'` fails (permission denied).
5. RPC: `new -> accepted` fails (23514). `under_review -> needs_rework` without a comment fails (23514), also with tab/newline-only comments. Assignee B on assignee A's task fails (P0002).
6. `insert`, `update`, `delete` on `task_status_history` fail for manager and assignee.
7. `insert into tasks` with `status='accepted'` or a foreign `author_id` fails (grant). A normal manager insert gives status `new`, author = me, and one history row.
8. Manager `delete from tasks` fails (permission denied). Manager `rpc delete_task` succeeds: the task vanishes from lists, its history rows remain (checked as the owner). Assignee calling `delete_task` gets 42501. A second `delete_task` gets P0002.
9. `anon` key without login: every table and the RPCs are denied. Sign-up endpoint returns "signups not allowed".
10. Insert into `profiles`, or update own `role`, fails.
11. `authenticated` calling `is_assignee_user()` directly fails (permission denied).

The same checks run as scripts: `npm run db:verify` (SQL-level, each attack in a rolled-back transaction, impersonating each user as PostgREST does) and `npm run attack` (against the API).

## 10. How to explain this on the call (plain English)

- **Where is security enforced?** In the database. The React app is only a remote control. If someone ignores it and talks to Supabase directly, the same rules apply, because RLS (row level security) is Postgres checking every query against a rule.
- **What is RLS?** Each table has rules like "a row is visible if you are a manager, or it is assigned to you, and it is not archived". Postgres adds that rule to every query automatically. If no rule allows it, you get nothing.
- **Why a `profiles` table for roles?** The login system only knows email and password. I added a small table saying who is manager or assignee. I did not use user metadata because users can edit their own metadata.
- **Why a helper `is_manager()`?** Policies on `profiles` need to ask "is this person a manager?", which means reading `profiles`, which triggers the policy again: an endless loop. The function runs with owner rights, skips the policy and breaks the loop. The empty search_path is a safety setting so the function cannot be tricked into calling a fake table.
- **How are status changes protected?** Nobody can write `status` directly, not even a manager. There is one function, `change_task_status`. It checks who you are, whether it is your task, whether the move is on the allowed list (a small table with the 5 legal moves), and whether a comment is present when needed. Then it changes the status and writes the history in one step. A trigger is a second lock in case the first is ever loosened.
- **Why a transitions table, not an IF chain?** The rules are data. You can read the whole workflow in 5 rows.
- **Why lock the row?** `FOR UPDATE` makes two simultaneous clicks queue up instead of both succeeding.
- **Why can history not be forged?** Clients have no permission to write it. Only the function and a creation trigger do, and they run with owner rights. The user cannot pass an actor id; it comes from the login token (`auth.uid()`).
- **Why SECURITY DEFINER on the RPC if it is risky?** It must write status and history, which clients are not allowed to. So it has to check everything itself, because RLS does not apply inside it. That is why it re-checks the assignee by hand.
- **Why can nothing be deleted?** A manager's delete button archives the task. It gets a `deleted_at` time and disappears from every list, but its history stays in the table, as the spec requires. A site with any task, archived or not, cannot be deleted, because that would break the trail. Limitation: archived rows still exist, and there is no un-archive button yet.
- **Why two UPDATE triggers on tasks?** The status guard must see the real caller, so it runs as the invoker. The assignee check must call a helper that clients are not allowed to run, so it runs with owner rights. Each job gets its own trigger.
- **What would you add with more time?** Log reassignments, an un-archive action for managers, a deactivate flag for users, rate limiting, and a pgTAP suite in place of the two check scripts.
- **What did you rely on from Supabase?** Auth for logins (sign-up disabled), PostgREST for the API (it respects grants and RLS), the anon key in the frontend. `service_role` is never used.

## 11. Migration history

Each migration is applied in order by `npm run db:apply`, which records a SHA-256 checksum of every file in `private._migrations` (a schema the API does not expose) and warns if an applied file changes. Files 0001-0005 are never edited after they are applied, so every later fix is a new migration.

- **0001_schema.sql**: enums, tables, the transition table, indexes. Its first lines revoke Supabase's default privileges on new tables, sequences and functions, so new objects are never granted to `anon` or `authenticated`, even between migrations.
- **0002_helpers.sql**: `is_manager()` and `is_assignee_user()`, both `SECURITY DEFINER` with an empty `search_path`. They break the RLS recursion on `profiles`.
- **0003_rls.sql**: enables RLS on all five tables and creates the first set of policies. 0006 changes the tasks policies.
- **0004_status_rpc_and_triggers.sql**: `change_task_status()`, the insert and update triggers, the creation-history trigger, and the revoke of trigger functions. Its comment trim already uses an explicit whitespace set, because one-argument `btrim()` only strips spaces.
- **0005_grants.sql**: the blanket revoke, the minimum grants with column lists, and the function grants. It runs last so the revoke covers everything before it.
- **0006_hardening.sql**: the fixes from the security review of 0001-0005. Why it exists, by finding:
  - **M1, soft delete.** Spec §3, requirement 4: status history cannot be forged, edited, or deleted via the API. With `ON DELETE CASCADE`, deleting a task through the API removed its history. 0006 adds `tasks.deleted_at` and `tasks.deleted_by`, adds `delete_task()`, changes the history FK to RESTRICT, revokes DELETE on tasks and drops the tasks DELETE policy. The tasks SELECT and UPDATE policies skip archived rows, and `change_task_status()` treats archived tasks as not found.
  - **M2, Unicode blanks.** A comment made only of Unicode blank characters (NBSP, zero-width space, line and paragraph separators, ideographic space, BOM and others) is now treated as empty. The stored text is still trimmed of ASCII whitespace only, and keeps its inner spacing.
  - **M3, length limits.** CHECK constraints on title (200), description (5000), site name (200), address (500), full name (200) and history comment (2000). The RPC also raises "comment is too long" (23514) before it writes anything.
  - **L1, client EXECUTE on `is_assignee_user()`.** No policy needed it. The assignee checks moved into definer triggers (`tasks_before_insert`, `tasks_check_assignee`), and `is_assignee_user()` lost its `authenticated` grant.
  - **L3, PUBLIC execute on functions.** The earlier per-schema default revoke did not stop PUBLIC from executing new functions, because the built-in global default grants EXECUTE to PUBLIC. 0006 adds the global form. Every existing function was already revoked explicitly, so nothing was exposed.

Checks: `npm run db:verify` (SQL-level) and `npm run attack` (API-level) cover the cases in §9 and §8. Earlier counts of cases were removed from this document because they go stale; the scripts print the current totals.
