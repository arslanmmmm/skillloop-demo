-- 006_teacher_helpers.sql — Teachers as helpers (weeks 9–10)
-- Run this in the Supabase SQL Editor after 005. Safe to re-run; it keeps your data.
-- schema.sql contains the same block, so a fresh setup only needs schema.sql.
--
-- Approved teachers can list subjects they teach, and students can ask them
-- for help. Because a teacher is an adult talking 1:1 with a student:
--   * only students can start a help request (a teacher never contacts a
--     student first), and a teacher cannot be asked while their teacher
--     account is still waiting for approval;
--   * students can block a teacher (this closes the chat);
--   * a teacher cannot see or handle reports about themselves, so they never
--     learn who reported them and cannot close those reports.

-- Same as Step 5, plus the two teacher rules at the top of the INSERT branch.
create or replace function public.check_help_request_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if me is not null and me <> new.requester_id then
      return new;
    end if;
    if exists (
      select 1 from public.profiles p where p.id = new.requester_id and p.role = 'teacher'
    ) then
      raise exception 'Teachers answer help requests but cannot send them' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.profiles p
      where p.id = new.helper_id and p.role <> 'teacher' and p.requested_role = 'teacher'
    ) then
      raise exception 'This help request is not available' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.user_subjects s
      where s.user_id = new.helper_id and s.subject = new.subject and s.kind = 'offer'
    ) then
      raise exception 'This student does not teach that subject' using errcode = 'P0001';
    end if;
  elsif not (old.status = 'pending' and new.status = 'accepted')
    or (me is not null and me <> old.helper_id) then
    return new;
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = new.requester_id and b.blocked_id = new.helper_id)
       or (b.blocker_id = new.helper_id and b.blocked_id = new.requester_id)
  ) then
    raise exception 'This help request is not available' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.check_help_request_safety() from public, anon, authenticated;

-- Anyone can be blocked now, including teachers (Step 5 excluded them).
drop policy if exists "blocks insert own" on public.blocks;
create policy "blocks insert own"
  on public.blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

-- Teachers handle reports, except reports about themselves.
drop policy if exists "reports select own or teacher" on public.reports;
create policy "reports select own or teacher"
  on public.reports for select
  to authenticated
  using (
    reporter_id = auth.uid()
    or (public.is_teacher() and reported_user_id is distinct from auth.uid())
  );

drop policy if exists "reports teacher update" on public.reports;
create policy "reports teacher update"
  on public.reports for update
  to authenticated
  using (public.is_teacher() and reported_user_id is distinct from auth.uid())
  with check (public.is_teacher() and reported_user_id is distinct from auth.uid());

-- Teachers do not need help: remove "needs" left from before approval.
delete from public.user_subjects s
using public.profiles p
where p.id = s.user_id and p.role = 'teacher' and s.kind = 'need';

notify pgrst, 'reload schema';
