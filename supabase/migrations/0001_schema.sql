-- 0001_schema.sql
-- Enums, tables, the transition table (state machine as data) and indexes.
-- Source of truth: docs/03-db-security-design.md, sections 1 and 7.

-- Supabase's default privileges grant ALL on every new public table/function/sequence
-- to anon and authenticated. Switch that off first, so the tables below are never
-- exposed, not even between this migration and 0005_grants.sql.
-- (No "for role": applies to objects created by the current role, postgres.)
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon;

-- One role per user. Stored in public.profiles, never in user_metadata (user-editable).
create type public.user_role as enum ('manager', 'assignee');

-- The five task states from the spec.
create type public.task_status as enum
  ('new', 'in_progress', 'under_review', 'accepted', 'needs_rework');

-- profiles: 1:1 with auth.users. Holds the display name and the role.
-- No email here: the login system already owns it, and assignees must not harvest it.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,  -- no login -> no profile
  full_name  text not null check (length(btrim(full_name)) > 0),             -- blank names rejected
  role       public.user_role not null,
  created_at timestamptz not null default now()
);

-- sites: construction sites.
create table public.sites (
  id         bigint generated always as identity primary key,  -- clients cannot choose ids
  name       text not null check (length(btrim(name)) > 0),
  address    text not null default '',
  created_at timestamptz not null default now()
);

-- tasks: one piece of work on one site for one assignee.
create table public.tasks (
  id          bigint generated always as identity primary key,
  -- RESTRICT: deleting a site with tasks fails (23503) instead of wiping tasks + history.
  site_id     bigint not null references public.sites (id)    on delete restrict,
  -- Every task has an assignee (the manager assigns on create). RESTRICT: never orphan work.
  assignee_id uuid   not null references public.profiles (id) on delete restrict,
  -- Forced to auth.uid() by the insert trigger (0004); the client cannot set it.
  author_id   uuid   not null references public.profiles (id) on delete restrict,
  title       text   not null check (length(btrim(title)) > 0),
  description text   not null default '',
  -- Forced to 'new' on insert; afterwards only change_task_status() may write it.
  status      public.task_status not null default 'new',
  created_at  timestamptz not null default now()
);

-- task_status_history: append-only audit log. Clients can only read it (0003, 0005).
create table public.task_status_history (
  id          bigint generated always as identity primary key,
  -- CASCADE: the history belongs to its task; deleting a task deletes its history.
  task_id     bigint not null references public.tasks (id)    on delete cascade,
  -- RESTRICT: never lose "who did it".
  actor_id    uuid   not null references public.profiles (id) on delete restrict,
  from_status public.task_status,            -- NULL = the creation row ("-" -> new)
  to_status   public.task_status not null,
  comment     text,                          -- trimmed, NULL when empty (set by the RPC)
  created_at  timestamptz not null default now()
);

-- task_transitions: the single source of truth for the state machine.
-- One row per legal move. Anything not listed here is forbidden.
create table public.task_transitions (
  from_status      public.task_status not null,
  to_status        public.task_status not null,
  actor            public.user_role   not null,  -- which role may make this move
  comment_required boolean not null default false,
  primary key (from_status, to_status)
);

insert into public.task_transitions (from_status, to_status, actor, comment_required) values
  ('new',          'in_progress',  'assignee', false),  -- assignee starts work
  ('in_progress',  'under_review', 'assignee', false),  -- assignee sends for review
  ('under_review', 'accepted',     'manager',  false),  -- manager accepts (final)
  ('under_review', 'needs_rework', 'manager',  true),   -- manager returns, comment required
  ('needs_rework', 'in_progress',  'assignee', false);  -- assignee resumes work

-- Indexes: every FK column and every column used inside an RLS policy.
create index tasks_assignee_id_idx on public.tasks (assignee_id);  -- RLS predicate, "My Tasks"
create index tasks_site_id_idx     on public.tasks (site_id);      -- site card, sites policy, FK
create index tasks_author_id_idx   on public.tasks (author_id);    -- FK, profiles policy
create index history_task_id_idx   on public.task_status_history (task_id, id);  -- history list, RLS
create index history_actor_id_idx  on public.task_status_history (actor_id);     -- FK, profiles policy
-- profiles.id is the primary key, already indexed.
