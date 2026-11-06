-- 0005_grants.sql
-- Table/column/function privileges. Runs last so the blanket revoke covers everything.
-- Source of truth: docs/03-db-security-design.md, section 6.
--
-- Two independent locks: grants decide WHAT a role may do to a table/column at all
-- (checked first, error "permission denied"); RLS (0003) decides WHICH ROWS.

-- 1. Wipe whatever Supabase's defaults handed out.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;
-- Repeated from 0001 so this file is self-contained: future objects start with nothing.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon;

-- 2. Schema access. Note: on Supabase the public schema is owned by pg_database_owner
-- and PUBLIC keeps USAGE, so this revoke is belt-and-braces only. What actually stops
-- anon is that it holds no table and no function privilege (step 1).
revoke all on schema public from anon;
grant usage on schema public to authenticated;

-- 3. Minimum grants for signed-in users.
-- Read-only tables: no write path from the API at all.
grant select on public.profiles, public.task_status_history to authenticated;
-- Sites/tasks: read + delete (RLS limits both to managers / own rows).
grant select, delete on public.sites, public.tasks to authenticated;
-- Column grants: only these columns may appear in an INSERT/UPDATE.
grant insert (name, address), update (name, address) on public.sites to authenticated;
-- status, author_id, created_at, id are NOT here: sending them -> permission denied.
grant insert (site_id, assignee_id, title, description),
      update (site_id, assignee_id, title, description) on public.tasks to authenticated;
-- task_transitions: no grant. Reached only through the definer RPC.
-- Identity columns need no sequence privileges, so none are granted.

-- 4. Re-grant the callable functions after the blanket revoke above.
grant execute on function public.is_manager()           to authenticated;
grant execute on function public.is_assignee_user(uuid) to authenticated;
grant execute on function public.change_task_status(bigint, public.task_status, text)
  to authenticated;
-- Trigger functions stay revoked from authenticated (done in 0004).
