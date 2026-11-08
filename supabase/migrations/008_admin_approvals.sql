-- 008_admin_approvals.sql — Approve teachers in the app (weeks 9–10)
-- Run this in the Supabase SQL Editor after 007. Safe to re-run; it keeps your data.
-- schema.sql contains the same block, so a fresh setup only needs schema.sql.
--
-- A school admin approves or declines teacher sign-ups on the app's Admin page
-- instead of in the SQL editor, and can remove teacher rights again. Being an
-- admin is set only here, in the SQL editor, never from the app. Make the
-- first admin (normally your own teacher account) like this:
--   update public.profiles set is_admin = true where id = '<auth user uuid>';

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- True when the signed-in user is an admin (same pattern as is_teacher()).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_admin
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Step 5 rules, plus: nobody can make themselves an admin from the app, and an
-- admin may change someone's role only through the functions below.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
declare
  -- Inside decide_teacher(), run by an admin.
  admin_action boolean := auth.uid() is not null
    and coalesce(current_setting('skillloop.admin_action', true), '') = 'on'
    and public.is_admin();
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.role := 'student';
      new.is_admin := false;
    elsif not admin_action then
      new.role := old.role;
      new.is_admin := old.is_admin;
    end if;
  end if;
  if new.role = 'teacher' then
    new.requested_role := null;
  end if;
  return new;
end;
$$;

-- Admin only: open teacher requests, with the sign-up email so the admin can
-- check it is a real school address. Emails are not readable any other way.
create or replace function public.list_teacher_requests()
returns table (id uuid, display_name text, email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see teacher requests' using errcode = 'P0001';
  end if;
  return query
    select p.id, p.display_name, u.email::text, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.requested_role = 'teacher' and p.role <> 'teacher'
    order by p.created_at;
end;
$$;

-- Admin only: current teachers with their email.
create or replace function public.list_teachers()
returns table (id uuid, display_name text, email text, is_admin boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see this list' using errcode = 'P0001';
  end if;
  return query
    select p.id, p.display_name, u.email::text, p.is_admin
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'teacher'
    order by p.display_name;
end;
$$;

-- Admin only: 'approve' a pending request, 'decline' it (the account stays a
-- student account), or 'remove' teacher rights from a teacher.
create or replace function public.decide_teacher(target uuid, decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  person public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve teachers' using errcode = 'P0001';
  end if;
  select * into person from public.profiles where id = target;
  if not found then
    raise exception 'That account was not found' using errcode = 'P0001';
  end if;

  perform set_config('skillloop.admin_action', 'on', true);
  if decision = 'approve' then
    if person.role = 'teacher' or person.requested_role is distinct from 'teacher' then
      raise exception 'This person has no open teacher request' using errcode = 'P0001';
    end if;
    update public.profiles set role = 'teacher' where id = target;
  elsif decision = 'decline' then
    if person.requested_role is distinct from 'teacher' then
      raise exception 'This person has no open teacher request' using errcode = 'P0001';
    end if;
    update public.profiles set requested_role = null where id = target;
  elsif decision = 'remove' then
    if person.role <> 'teacher' then
      raise exception 'This person is not a teacher' using errcode = 'P0001';
    end if;
    if target = auth.uid() then
      raise exception 'You cannot remove your own teacher rights' using errcode = 'P0001';
    end if;
    update public.profiles set role = 'student', is_admin = false where id = target;
  else
    raise exception 'Unknown decision' using errcode = 'P0001';
  end if;
  perform set_config('skillloop.admin_action', 'off', true);
end;
$$;

revoke all on function public.list_teacher_requests() from public, anon;
revoke all on function public.list_teachers() from public, anon;
revoke all on function public.decide_teacher(uuid, text) from public, anon;
grant execute on function public.list_teacher_requests() to authenticated;
grant execute on function public.list_teachers() to authenticated;
grant execute on function public.decide_teacher(uuid, text) to authenticated;

notify pgrst, 'reload schema';
