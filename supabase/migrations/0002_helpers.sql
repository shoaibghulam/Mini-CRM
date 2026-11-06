-- 0002_helpers.sql
-- Role-check helpers used by RLS policies and triggers.
-- Source of truth: docs/03-db-security-design.md, section 2.
--
-- Why SECURITY DEFINER: the profiles SELECT policy must ask "is the caller a manager?",
-- which means reading profiles, which would trigger the same policy again (infinite
-- recursion). A definer function runs as its owner (postgres), which bypasses RLS,
-- so the lookup does not re-enter any policy.
--
-- Why set search_path = '': a definer function runs with owner rights. With a normal
-- search_path, someone could create a look-alike object in a schema they control and
-- have it executed with those rights. An empty path forces fully qualified names.
--
-- STABLE: same answer within one statement, so Postgres may cache it.
-- (select auth.uid()): evaluated once as an init-plan, not once per row.

-- True when the current caller has role 'manager' in profiles.
create function public.is_manager() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'manager'
  );
$$;

-- True when the given user id has role 'assignee'. Used to validate tasks.assignee_id.
create function public.is_assignee_user(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_id and role = 'assignee');
$$;

-- Nobody but signed-in users may call them. PUBLIC is the implicit "every role" grantee.
revoke execute on function public.is_manager()           from public, anon;
revoke execute on function public.is_assignee_user(uuid) from public, anon;
grant  execute on function public.is_manager()           to authenticated;
-- is_assignee_user is called from triggers that run as the caller, so it needs EXECUTE too.
grant  execute on function public.is_assignee_user(uuid) to authenticated;
