-- 0004_status_rpc_and_triggers.sql
-- The only door for status changes (change_task_status) plus the task triggers.
-- Source of truth: docs/03-db-security-design.md, sections 4 and 5.

-- ---------------------------------------------------------------------------
-- change_task_status: check + lock + update + history, in one transaction.
-- SECURITY DEFINER because it writes status and history, which clients may not.
-- RLS does not apply inside it, so it re-checks visibility and role by hand.
-- The actor always comes from the JWT (auth.uid()), never from a parameter.
-- ---------------------------------------------------------------------------
create function public.change_task_status(
  p_task_id bigint, p_new_status public.task_status, p_comment text default null
) returns public.tasks
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());           -- caller, from the verified JWT
  v_role    public.user_role;
  v_task    public.tasks;
  v_rule    public.task_transitions;
  -- '' / '   ' / tabs / newlines all collapse to NULL ("no comment").
  -- btrim() alone only strips spaces, so strip all whitespace classes explicitly.
  v_comment text := nullif(btrim(coalesce(p_comment, ''), E' \t\r\n\f\v'), '');
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then raise exception 'no profile' using errcode = '42501'; end if;

  -- Lock the row so two concurrent changes cannot both pass the check:
  -- the second waits, then re-reads the new status and fails the transition check.
  select * into v_task from public.tasks where id = p_task_id for update;

  -- Definer bypasses RLS, so re-apply visibility by hand.
  -- Same error for "missing" and "not yours": do not leak that the task exists.
  if not found or (v_role = 'assignee' and v_task.assignee_id <> v_uid) then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  -- Is (current status -> requested status) one of the legal moves?
  select * into v_rule from public.task_transitions
   where from_status = v_task.status and to_status = p_new_status;
  if not found then
    raise exception 'transition % -> % is not allowed', v_task.status, p_new_status
      using errcode = '23514';
  end if;

  -- Right role for this move? Assignee moves need the *assigned* assignee.
  if v_rule.actor <> v_role
     or (v_rule.actor = 'assignee' and v_task.assignee_id <> v_uid) then
    raise exception 'not allowed for your role' using errcode = '42501';
  end if;

  if v_rule.comment_required and v_comment is null then
    raise exception 'comment is required' using errcode = '23514';
  end if;

  update public.tasks set status = p_new_status where id = p_task_id
    returning * into v_task;

  insert into public.task_status_history
    (task_id, actor_id, from_status, to_status, comment)
  values (p_task_id, v_uid, v_rule.from_status, p_new_status, v_comment);

  return v_task;
end $$;

revoke execute on function public.change_task_status(bigint, public.task_status, text)
  from public, anon;
grant  execute on function public.change_task_status(bigint, public.task_status, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- BEFORE INSERT: force status and author; the client's values are ignored.
-- SECURITY INVOKER (default): runs as the caller.
-- ---------------------------------------------------------------------------
create function public.tasks_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.status     := 'new';
  new.author_id  := (select auth.uid());   -- NULL without a JWT -> NOT NULL violation
  new.created_at := now();
  if not public.is_assignee_user(new.assignee_id) then
    raise exception 'assignee must be a user with role assignee' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger tasks_bi before insert on public.tasks
  for each row execute function public.tasks_before_insert();

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE guard (defence in depth behind the column grants).
-- SECURITY INVOKER on purpose: current_user is the real caller. Inside the RPC it is
-- the function owner (postgres), so the RPC passes; a direct client UPDATE does not.
-- ---------------------------------------------------------------------------
create function public.tasks_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status
     and current_user in ('authenticated', 'anon') then
    raise exception 'status can only be changed via change_task_status()' using errcode = '42501';
  end if;
  if new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at then
    raise exception 'author_id and created_at are immutable' using errcode = '42501';
  end if;
  if old.status = 'accepted' then                      -- accepted = final, content frozen
    raise exception 'accepted tasks are frozen' using errcode = '23514';
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    if old.status = 'under_review' then                -- review in progress
      raise exception 'cannot reassign while under review' using errcode = '23514';
    end if;
    if not public.is_assignee_user(new.assignee_id) then
      raise exception 'assignee must be a user with role assignee' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger tasks_bu before update on public.tasks
  for each row execute function public.tasks_before_update();

-- ---------------------------------------------------------------------------
-- AFTER INSERT: write the creation row ("-" -> new) into history.
-- SECURITY DEFINER: clients have no INSERT on history, the owner does.
-- ---------------------------------------------------------------------------
create function public.tasks_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_status_history (task_id, actor_id, from_status, to_status)
  values (new.id, new.author_id, null, 'new');
  return new;
end $$;
create trigger tasks_ai after insert on public.tasks
  for each row execute function public.tasks_after_insert();

-- Trigger functions are not callable as RPCs by anyone.
-- (Triggers still fire: EXECUTE is checked at CREATE TRIGGER time, not at fire time.)
revoke execute on function public.tasks_before_insert(), public.tasks_before_update(),
  public.tasks_after_insert() from public, anon, authenticated;
