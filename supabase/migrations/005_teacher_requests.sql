-- 005_teacher_requests.sql — Sign up as a student or as a teacher (weeks 9–10)
-- Run this in the Supabase SQL Editor after 004. Safe to re-run; it keeps your data.
-- schema.sql contains the same block, so a fresh setup only needs schema.sql.
--
-- Choosing "Teacher" at sign-up only sends a request. The account stays a
-- student account (and the app shows a waiting screen) until an admin approves it:
--   update public.profiles set role = 'teacher' where id = '<auth user uuid>';
-- To see open requests:
--   select id, display_name, created_at from public.profiles where requested_role = 'teacher';
-- To refuse one, delete that user under Authentication → Users.

alter table public.profiles add column if not exists requested_role text;
alter table public.profiles drop constraint if exists profiles_requested_role_check;
alter table public.profiles
  add constraint profiles_requested_role_check
  check (requested_role is null or requested_role = 'teacher');

-- Students cannot promote themselves; only an admin in the SQL editor
-- (auth.uid() is null there) changes role. A student may request teacher or
-- withdraw the request. Approving the request clears it.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.role := 'student';
  elsif tg_op = 'UPDATE' and auth.uid() is not null then
    new.role := old.role;
  end if;
  if new.role = 'teacher' then
    new.requested_role := null;
  end if;
  return new;
end;
$$;

-- Same as before, plus: account_type 'teacher' in the sign-up data records a
-- teacher request (never the teacher role itself). Teachers pick no subjects.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_grade smallint;
  wants_teacher boolean := coalesce(new.raw_user_meta_data->>'account_type', '') = 'teacher';
begin
  begin
    new_grade := nullif(new.raw_user_meta_data->>'grade', '')::smallint;
  exception
    when others then
      new_grade := null;
  end;

  if wants_teacher or (new_grade is not null and (new_grade < 7 or new_grade > 12)) then
    new_grade := null;
  end if;

  insert into public.profiles (id, display_name, grade, role, requested_role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
    new_grade,
    'student',
    case when wants_teacher then 'teacher' end
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        grade = coalesce(excluded.grade, public.profiles.grade),
        requested_role = coalesce(excluded.requested_role, public.profiles.requested_role);

  if wants_teacher then
    return new;
  end if;

  insert into public.user_subjects (user_id, subject, kind)
  select new.id, value, 'offer'
  from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'offers', '[]'::jsonb)) as value
  on conflict do nothing;

  insert into public.user_subjects (user_id, subject, kind)
  select new.id, value, 'need'
  from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'needs', '[]'::jsonb)) as value
  on conflict do nothing;

  return new;
end;
$$;

notify pgrst, 'reload schema';
