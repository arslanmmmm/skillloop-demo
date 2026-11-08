-- 007_edit_posts.sql — Edit your own posts; teachers do not block (weeks 9–10)
-- Run this in the Supabase SQL Editor after 006. Safe to re-run; it keeps your data.
-- schema.sql contains the same block, so a fresh setup only needs schema.sql.
--
-- Students can now fix the title and text of their own explanations, so that a
-- teacher's "needs correction" note can be acted on. So that an edit cannot be
-- used to sneak changed content past teachers and readers:
--   * a teacher-verified post goes back to "not reviewed" when its text changes;
--   * helpful votes are cleared, because they were for the old text;
--   * the subject and the post date cannot change, and a post a teacher hid
--     cannot be edited (only a teacher can bring it back);
--   * edits are at least 30 seconds apart, and edited_at is set here, never
--     by the browser. Reports keep the text as it was when reported.
-- Teachers can no longer block students: a block hides the student's posts
-- from the blocker, which would get in the way of teacher oversight.

alter table public.explanations add column if not exists edited_at timestamptz;

-- Step 4 rules for teacher review fields, plus the author editing rules above.
create or replace function public.protect_explanation_review()
returns trigger
language plpgsql
as $$
declare
  me uuid := auth.uid();
  text_changed boolean;
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
    new.edited_at := null;
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

  if old.author_id <> me then
    if new.title is distinct from old.title
      or new.body is distinct from old.body
      or new.subject is distinct from old.subject
      or new.author_id is distinct from old.author_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Teachers can review a post but not change what the student wrote'
        using errcode = 'P0001';
    end if;
    new.edited_at := old.edited_at;
    return new;
  end if;

  -- The author editing their own post.
  if new.id is distinct from old.id
    or new.subject is distinct from old.subject
    or new.created_at is distinct from old.created_at then
    raise exception 'Only the title and text of a post can be edited' using errcode = 'P0001';
  end if;

  text_changed := trim(new.title) is distinct from trim(old.title)
    or trim(new.body) is distinct from trim(old.body);
  if not text_changed then
    new.edited_at := old.edited_at;
    return new;
  end if;

  if old.review_status = 'hidden' then
    raise exception 'A teacher hid this post, so it cannot be edited. Ask your teacher about it.'
      using errcode = 'P0001';
  end if;
  if old.edited_at > now() - interval '30 seconds' then
    raise exception 'Please wait a few seconds before editing again' using errcode = 'P0001';
  end if;

  new.edited_at := now();
  if old.review_status = 'verified' then
    new.review_status := 'none';
    new.teacher_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

-- Votes were for the old text. Runs with the owner's rights because students
-- may only delete their own votes.
create or replace function public.clear_votes_on_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.votes where explanation_id = new.id;
  return null;
end;
$$;

revoke all on function public.clear_votes_on_edit() from public, anon, authenticated;

drop trigger if exists explanations_clear_votes on public.explanations;
create trigger explanations_clear_votes
  after update on public.explanations
  for each row
  when (new.edited_at is not null and new.edited_at is distinct from old.edited_at)
  execute function public.clear_votes_on_edit();

-- Teachers cannot block. Students can still block anyone, teachers included (006).
drop policy if exists "blocks insert own" on public.blocks;
create policy "blocks insert own"
  on public.blocks for insert
  to authenticated
  with check (blocker_id = auth.uid() and not public.is_teacher());

-- Blocks a teacher made earlier (for example as a student, before approval).
delete from public.blocks b
using public.profiles p
where p.id = b.blocker_id and p.role = 'teacher';

-- And the same whenever someone is approved as a teacher later.
create or replace function public.clear_blocks_by_new_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.blocks where blocker_id = new.id;
  return null;
end;
$$;

revoke all on function public.clear_blocks_by_new_teacher() from public, anon, authenticated;

drop trigger if exists profiles_clear_teacher_blocks on public.profiles;
create trigger profiles_clear_teacher_blocks
  after update of role on public.profiles
  for each row
  when (new.role = 'teacher' and old.role is distinct from 'teacher')
  execute function public.clear_blocks_by_new_teacher();

notify pgrst, 'reload schema';
