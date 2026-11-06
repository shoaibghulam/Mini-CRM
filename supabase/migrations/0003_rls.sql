-- 0003_rls.sql
-- Row Level Security: which ROWS each user may see or touch.
-- (Which COLUMNS they may write is decided by the grants in 0005.)
-- Source of truth: docs/03-db-security-design.md, section 3.
--
-- Deny by default: once RLS is on, a table returns nothing unless a policy allows it.
-- Every policy is "to authenticated"; anon has no policy and no grant anywhere.
-- Cycle check: tasks/history policies never read profiles directly (only through
-- is_manager(), which bypasses RLS), so policies cannot recurse into each other.

alter table public.profiles            enable row level security;
alter table public.sites               enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_status_history enable row level security;
alter table public.task_transitions    enable row level security;  -- no policies: invisible

-- ---------------------------------------------------------------------------
-- profiles: read-only through the API. No insert/update/delete policy at all,
-- so nobody can change their own role or create a fake profile.
-- Manager: all rows (assignee dropdown). Assignee: self, authors of their tasks,
-- actors in the history of their tasks (enough to render names, nothing more).
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
using (
  public.is_manager()
  or id = (select auth.uid())
  -- the subqueries below are themselves filtered by tasks/history RLS
  or exists (select 1 from public.tasks t
             where t.assignee_id = (select auth.uid()) and t.author_id = profiles.id)
  or exists (select 1 from public.task_status_history h
             join public.tasks t on t.id = h.task_id
             where t.assignee_id = (select auth.uid()) and h.actor_id = profiles.id)
);

-- ---------------------------------------------------------------------------
-- sites: manager does everything; assignee only sees sites where they have a task.
-- ---------------------------------------------------------------------------
create policy sites_select on public.sites for select to authenticated
using (
  public.is_manager()
  or exists (select 1 from public.tasks t
             where t.site_id = sites.id and t.assignee_id = (select auth.uid()))
);
create policy sites_insert on public.sites for insert to authenticated
  with check (public.is_manager());
create policy sites_update on public.sites for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy sites_delete on public.sites for delete to authenticated
  using (public.is_manager());

-- ---------------------------------------------------------------------------
-- tasks: manager sees and edits all; assignee sees only their own and writes nothing
-- (their only write path is the change_task_status() RPC in 0004).
-- ---------------------------------------------------------------------------
create policy tasks_select on public.tasks for select to authenticated
using (public.is_manager() or assignee_id = (select auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_manager());
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_manager());

-- ---------------------------------------------------------------------------
-- task_status_history: SELECT only. Visible iff the task itself is visible.
-- The subquery on tasks is filtered by the tasks policy: one source of truth.
-- No insert/update/delete policy: clients can never write history.
-- ---------------------------------------------------------------------------
create policy history_select on public.task_status_history for select to authenticated
using (exists (select 1 from public.tasks t where t.id = task_status_history.task_id));
