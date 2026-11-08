-- 003_teacher_review.sql — Teacher review of explanations (Step 4, weeks 9–10)
-- Run this in the Supabase SQL Editor after 002. Safe to re-run; it keeps your data.
-- schema.sql contains the same block, so a fresh setup only needs schema.sql.
-- Make someone a teacher by hand (students can never change their own role;
-- see protect_profile_role in schema.sql):
--   update public.profiles set role = 'teacher' where id = '<auth user uuid>';

-- True when the signed-in user is a teacher. security definer so it can be
-- used inside RLS policies without depending on the caller's own policies.
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'teacher'
  );
$$;

revoke all on function public.is_teacher() from public, anon;
grant execute on function public.is_teacher() to authenticated;

alter table public.explanations add column if not exists review_status text not null default 'none';
alter table public.explanations add column if not exists teacher_note text;
alter table public.explanations add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.explanations add column if not exists reviewed_at timestamptz;
alter table public.explanations drop constraint if exists explanations_review_status_check;
alter table public.explanations
  add constraint explanations_review_status_check
  check (review_status in ('none', 'verified', 'needs_correction', 'hidden'));
alter table public.explanations drop constraint if exists explanations_teacher_note_check;
alter table public.explanations
  add constraint explanations_teacher_note_check
  check (teacher_note is null or char_length(trim(teacher_note)) between 1 and 500);

-- Only teachers may set the review fields, and teachers may change nothing
-- else on a student's post. Who reviewed and when is set here, not by the browser.
create or replace function public.protect_explanation_review()
returns trigger
language plpgsql
as $$
declare
  me uuid := auth.uid();
begin
  -- SQL editor (no signed-in user): an admin may fix data by hand.
  if me is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.review_status := 'none';
    new.teacher_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  if new.review_status is distinct from old.review_status
    or new.teacher_note is distinct from old.teacher_note
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at then
    if not public.is_teacher() then
      raise exception 'Only teachers can review explanations' using errcode = 'P0001';
    end if;
    if new.review_status = 'needs_correction' and coalesce(trim(new.teacher_note), '') = '' then
      raise exception 'Write a short note saying what needs correcting' using errcode = 'P0001';
    end if;
    if new.review_status = 'none' then
      new.teacher_note := null;
    end if;
    new.reviewed_by := case when new.review_status = 'none' then null else me end;
    new.reviewed_at := case when new.review_status = 'none' then null else now() end;
  end if;

  if old.author_id <> me
    and (new.title is distinct from old.title
      or new.body is distinct from old.body
      or new.subject is distinct from old.subject
      or new.author_id is distinct from old.author_id
      or new.created_at is distinct from old.created_at) then
    raise exception 'Teachers can review a post but not change what the student wrote'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists explanations_review_protect on public.explanations;
create trigger explanations_review_protect
  before insert or update on public.explanations
  for each row execute function public.protect_explanation_review();

-- Hidden posts disappear for students; the author and teachers still see them.
drop policy if exists "explanations select authenticated" on public.explanations;
drop policy if exists "explanations select visible" on public.explanations;
create policy "explanations select visible"
  on public.explanations for select
  to authenticated
  using (review_status <> 'hidden' or author_id = auth.uid() or public.is_teacher());

-- Teachers may update any post (the trigger limits them to the review fields).
drop policy if exists "explanations teacher review" on public.explanations;
create policy "explanations teacher review"
  on public.explanations for update
  to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

notify pgrst, 'reload schema';
