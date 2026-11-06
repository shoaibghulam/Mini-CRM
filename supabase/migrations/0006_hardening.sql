-- 0006_hardening.sql
-- Fixes from the security review of 0001-0005. Applied files are never edited
-- (db-apply tracks checksums), so every change is made here.
--   M1  soft delete for tasks: history can never be removed through the API
--   M2  Unicode-only whitespace (NBSP, zero-width, ...) counts as an empty comment
--   M3  length limits on every free-text column
--   L1  is_assignee_user() no longer callable by clients
--   L3  global default privilege: new functions are not executable by PUBLIC
--
-- L3, and a correction of the wording in 0001/0005: those files say
-- "alter default privileges in schema public revoke ... on functions from public"
-- stops new functions being executable by everyone. It does not. Per-schema default
-- privileges can only ADD to the global defaults, and the built-in global default
-- grants EXECUTE on every new function to PUBLIC. That is why each function so far
-- needed its own explicit "revoke execute ... from public". The global form below
-- (no IN SCHEMA) removes that built-in grant for functions postgres creates later.
alter default privileges revoke execute on functions from public;

-- ===========================================================================
-- M3: length limits (enforced by the DB, whatever the client sends).
-- char_length counts characters, not bytes. All seed data fits.
-- ===========================================================================
alter table public.profiles add constraint profiles_full_name_len check (char_length(full_name) <= 200);
alter table public.sites    add constraint sites_name_len         check (char_length(name) <= 200);
alter table public.sites    add constraint sites_address_len      check (char_length(address) <= 500);
alter table public.tasks    add constraint tasks_title_len        check (char_length(title) <= 200);
alter table public.tasks    add constraint tasks_description_len  check (char_length(description) <= 5000);
alter table public.task_status_history
  add constraint history_comment_len check (comment is null or char_length(comment) <= 2000);

-- ===========================================================================
-- M1: soft delete. A "deleted" task is archived: invisible through the API,
-- its history rows stay in the table forever.
-- ===========================================================================
alter table public.tasks
  add column deleted_at timestamptz,                                          -- NULL = live
  add column deleted_by uuid references public.profiles (id) on delete restrict;  -- who archived it
create index tasks_deleted_by_idx on public.tasks (deleted_by);               -- FK index habit

-- History may no longer be removed by deleting its task: CASCADE -> RESTRICT.
-- (Even the owner now has to delete history explicitly before a hard task delete.)
alter table public.task_status_history drop constraint task_status_history_task_id_fkey;
alter table public.task_status_history
  add constraint task_status_history_task_id_fkey
  foreign key (task_id) references public.tasks (id) on delete restrict;

-- Clients lose DELETE on tasks entirely; the only way is delete_task() below.
-- deleted_at / deleted_by get no column grant, so a client cannot set them either.
revoke delete on public.tasks from authenticated;
drop policy tasks_delete on public.tasks;

-- Archived tasks vanish for everyone. Because history_select, sites_select and
-- profiles_select all look at tasks through the tasks policy, the archived task's
-- history, and a site seen only through it, vanish with it.
drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
using (deleted_at is null and (public.is_manager() or assignee_id = (select auth.uid())));

drop policy tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (deleted_at is null and public.is_manager())
  with check (deleted_at is null and public.is_manager());

-- delete_task: the manager's "delete" button. Archives, never removes.
create function public.delete_task(p_task_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Definer bypasses RLS, so the manager check is done by hand.
  if not exists (select 1 from public.profiles where id = v_uid and role = 'manager') then
    raise exception 'not allowed for your role' using errcode = '42501';
  end if;
  update public.tasks set deleted_at = now(), deleted_by = v_uid
   where id = p_task_id and deleted_at is null;
  if not found then                       -- missing or already archived: same answer
    raise exception 'task not found' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.delete_task(bigint) from public, anon;
grant  execute on function public.delete_task(bigint) to authenticated;

-- ===========================================================================
-- Triggers, rewritten.
-- L1: the assignee-role check moves into SECURITY DEFINER trigger functions, which
-- run as the owner and can call is_assignee_user() without clients holding EXECUTE.
-- tasks_before_update must stay SECURITY INVOKER (its status guard reads
-- current_user, which a definer function would always report as postgres), so its
-- assignee check moves to a separate definer trigger.
-- ===========================================================================
create or replace function public.tasks_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.status     := 'new';
  new.author_id  := (select auth.uid());   -- auth.uid() reads the JWT setting, works as definer
  new.created_at := now();
  new.deleted_at := null;                  -- belt and braces; no column grant anyway
  new.deleted_by := null;
  if not public.is_assignee_user(new.assignee_id) then
    raise exception 'assignee must be a user with role assignee' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function public.tasks_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is not null then                   -- archived = frozen for good
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if new.deleted_at is not null then
    -- Archiving: only through delete_task() (runs as owner) and nothing else may change.
    if current_user in ('authenticated', 'anon') then
      raise exception 'tasks can only be deleted via delete_task()' using errcode = '42501';
    end if;
    if (new.site_id, new.assignee_id, new.title, new.description, new.status)
       is distinct from (old.site_id, old.assignee_id, old.title, old.description, old.status) then
      raise exception 'archiving must not change task content' using errcode = '23514';
    end if;
    return new;                            -- accepted tasks may be archived too
  end if;
  if new.status is distinct from old.status
     and current_user in ('authenticated', 'anon') then
    raise exception 'status can only be changed via change_task_status()' using errcode = '42501';
  end if;
  if new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at then
    raise exception 'author_id and created_at are immutable' using errcode = '42501';
  end if;
  if old.status = 'accepted' then
    raise exception 'accepted tasks are frozen' using errcode = '23514';
  end if;
  if new.assignee_id is distinct from old.assignee_id and old.status = 'under_review' then
    raise exception 'cannot reassign while under review' using errcode = '23514';
  end if;
  return new;
end $$;

-- New definer trigger: the new assignee must have role assignee.
create function public.tasks_check_assignee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_assignee_user(new.assignee_id) then
    raise exception 'assignee must be a user with role assignee' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger tasks_bu_assignee before update of assignee_id on public.tasks
  for each row when (new.assignee_id is distinct from old.assignee_id)
  execute function public.tasks_check_assignee();

revoke execute on function public.tasks_before_insert(), public.tasks_before_update(),
  public.tasks_check_assignee() from public, anon, authenticated;

-- L1: no RLS policy calls is_assignee_user(); only the definer triggers above do.
revoke execute on function public.is_assignee_user(uuid) from authenticated;
-- is_manager() stays executable: RLS policies call it as the client.

-- ===========================================================================
-- change_task_status, replaced: archived tasks are "not found" (M1), Unicode-blank
-- comments are empty (M2), over-long comments get a clear error (M3).
-- ===========================================================================
create or replace function public.change_task_status(
  p_task_id bigint, p_new_status public.task_status, p_comment text default null
) returns public.tasks
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_role    public.user_role;
  v_task    public.tasks;
  v_rule    public.task_transitions;
  -- Stored value: ASCII whitespace trimmed at the ends, inner spacing kept.
  v_comment text := nullif(btrim(coalesce(p_comment, ''), E' \t\r\n\f\v'), '');
begin
  -- Emptiness test only: a comment made of nothing but whitespace, including
  -- NBSP, ogham space, U+2000-U+200B (incl. zero-width space), line/paragraph
  -- separators, narrow NBSP, math space, ideographic space, BOM, counts as none.
  if v_comment ~ E'^[\\s   -​    　﻿]*$' then
    v_comment := null;
  end if;

  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then raise exception 'no profile' using errcode = '42501'; end if;

  -- Lock the live row; an archived task behaves exactly like a missing one.
  select * into v_task from public.tasks
   where id = p_task_id and deleted_at is null for update;

  if not found or (v_role = 'assignee' and v_task.assignee_id <> v_uid) then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  select * into v_rule from public.task_transitions
   where from_status = v_task.status and to_status = p_new_status;
  if not found then
    raise exception 'transition % -> % is not allowed', v_task.status, p_new_status
      using errcode = '23514';
  end if;

  if v_rule.actor <> v_role
     or (v_rule.actor = 'assignee' and v_task.assignee_id <> v_uid) then
    raise exception 'not allowed for your role' using errcode = '42501';
  end if;

  if v_rule.comment_required and v_comment is null then
    raise exception 'comment is required' using errcode = '23514';
  end if;
  if char_length(v_comment) > 2000 then    -- same limit as history_comment_len
    raise exception 'comment is too long' using errcode = '23514';
  end if;

  update public.tasks set status = p_new_status where id = p_task_id
    returning * into v_task;

  insert into public.task_status_history
    (task_id, actor_id, from_status, to_status, comment)
  values (p_task_id, v_uid, v_rule.from_status, p_new_status, v_comment);

  return v_task;
end $$;
-- create or replace keeps the existing grants (authenticated only); restated for clarity.
revoke execute on function public.change_task_status(bigint, public.task_status, text) from public, anon;
grant  execute on function public.change_task_status(bigint, public.task_status, text) to authenticated;
