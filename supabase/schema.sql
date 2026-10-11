-- SkillLoop schema (Phase 1 + 2)
-- Paste and run this entire file in the Supabase SQL Editor.
-- Safe to re-run and keeps data: tables and columns are created only if missing,
-- and functions, triggers, policies and constraints are replaced in place.
-- It upgrades a live Phase 1 database as well as setting up a new project.

create extension if not exists "pgcrypto";

-- Leftover from the click-through demo; never used by the Supabase app.
drop table if exists public.reactions cascade;

-- Subjects students asked for in the survey (keep in sync with src/config/subjects.js).
-- Later phases can add columns (e.g. video_url, hidden_at, verified_at) and
-- tables (reports) without changing these core keys.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  grade smallint check (grade is null or grade between 7 and 12),
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_subjects (
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (
    subject in (
      'Math',
      'Physics',
      'Chemistry',
      'Biology',
      'History',
      'English',
      'Computer Science',
      'Geography'
    )
  ),
  kind text not null check (kind in ('offer', 'need')),
  primary key (user_id, subject, kind)
);

create table if not exists public.explanations (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (
    subject in (
      'Math',
      'Physics',
      'Chemistry',
      'Biology',
      'History',
      'English',
      'Computer Science',
      'Geography'
    )
  ),
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  explanation_id uuid not null references public.explanations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (explanation_id, user_id)
);

-- Top-level rows are a comment + 1–5 clarity rating. Replies have parent_id and no rating.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  explanation_id uuid not null references public.explanations (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  clarity_rating smallint,
  created_at timestamptz not null default now()
);

-- Phase 1 created feedback without replies and with a required rating.
alter table public.feedback
  add column if not exists parent_id uuid references public.feedback (id) on delete cascade;
alter table public.feedback alter column clarity_rating drop not null;
alter table public.feedback drop constraint if exists feedback_clarity_rating_check;
alter table public.feedback drop constraint if exists feedback_review_or_reply;
alter table public.feedback
  add constraint feedback_review_or_reply check (
    (parent_id is null and clarity_rating between 1 and 5)
    or (parent_id is not null and clarity_rating is null)
  );

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (
    subject in (
      'Math',
      'Physics',
      'Chemistry',
      'Biology',
      'History',
      'English',
      'Computer Science',
      'Geography'
    )
  ),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.help_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  helper_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (
    subject in (
      'Math',
      'Physics',
      'Chemistry',
      'Biology',
      'History',
      'English',
      'Computer Science',
      'Geography'
    )
  ),
  question_id uuid references public.questions (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  constraint help_requests_not_self check (requester_id <> helper_id)
);

create index if not exists explanations_created_at_idx on public.explanations (created_at desc);
create index if not exists explanations_author_idx on public.explanations (author_id);
create index if not exists votes_explanation_idx on public.votes (explanation_id);
create index if not exists votes_user_idx on public.votes (user_id);
create index if not exists feedback_explanation_idx on public.feedback (explanation_id);
create index if not exists user_subjects_user_idx on public.user_subjects (user_id);
create index if not exists questions_created_at_idx on public.questions (created_at desc);
create index if not exists help_requests_helper_idx on public.help_requests (helper_id, status);
create index if not exists help_requests_requester_idx on public.help_requests (requester_id);

create unique index if not exists feedback_one_review
  on public.feedback (explanation_id, author_id)
  where parent_id is null;

create unique index if not exists help_requests_one_pending
  on public.help_requests (requester_id, helper_id, subject)
  where status = 'pending';

-- Reputation = votes from other students on that author’s explanations in a subject.
create or replace view public.subject_reputation
with (security_invoker = true) as
select
  e.author_id as user_id,
  e.subject,
  count(v.id)::integer as reputation
from public.explanations e
left join public.votes v on v.explanation_id = e.id
group by e.author_id, e.subject;

create or replace function public.prevent_self_vote()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.explanations e
    where e.id = new.explanation_id
      and e.author_id = new.user_id
  ) then
    raise exception 'You cannot vote on your own explanation'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists votes_no_self_vote on public.votes;
create trigger votes_no_self_vote
  before insert on public.votes
  for each row execute function public.prevent_self_vote();

-- Runs on insert and update so an edit cannot turn a reply into a self-review
-- or move a review onto a different explanation.
create or replace function public.enforce_feedback_rules()
returns trigger
language plpgsql
as $$
declare
  explanation_author uuid;
  parent_explanation uuid;
begin
  if tg_op = 'UPDATE' then
    if new.explanation_id <> old.explanation_id
      or new.author_id <> old.author_id
      or new.parent_id is distinct from old.parent_id then
      raise exception 'Only the comment text and rating can be edited'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  select e.author_id into explanation_author
  from public.explanations e
  where e.id = new.explanation_id;

  if explanation_author is null then
    raise exception 'Explanation not found' using errcode = 'P0001';
  end if;

  if new.parent_id is null then
    if new.author_id = explanation_author then
      raise exception 'You cannot review your own explanation'
        using errcode = 'P0001';
    end if;
  else
    if new.author_id <> explanation_author then
      raise exception 'Only the author can reply'
        using errcode = 'P0001';
    end if;

    select f.explanation_id into parent_explanation
    from public.feedback f
    where f.id = new.parent_id and f.parent_id is null;

    if parent_explanation is null or parent_explanation <> new.explanation_id then
      raise exception 'Reply must belong to a comment on this explanation'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_rules on public.feedback;
create trigger feedback_rules
  before insert or update on public.feedback
  for each row execute function public.enforce_feedback_rules();

create or replace function public.protect_help_request()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.requester_id = new.helper_id then
    raise exception 'You cannot request help from yourself'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    if new.requester_id <> old.requester_id
      or new.helper_id <> old.helper_id
      or new.subject <> old.subject
      or new.question_id is distinct from old.question_id then
      raise exception 'Cannot change who this request is for'
        using errcode = 'P0001';
    end if;
    if old.status <> 'pending' then
      raise exception 'This request was already answered'
        using errcode = 'P0001';
    end if;
    if new.status not in ('accepted', 'declined') then
      raise exception 'Status must be accepted or declined'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists help_requests_protect on public.help_requests;
create trigger help_requests_protect
  before insert or update on public.help_requests
  for each row execute function public.protect_help_request();

-- Students cannot promote themselves. Admins change role in the SQL editor
-- (auth.uid() is null there).
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
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before insert or update on public.profiles
  for each row execute function public.protect_profile_role();

alter table public.profiles enable row level security;
alter table public.user_subjects enable row level security;
alter table public.explanations enable row level security;
alter table public.votes enable row level security;
alter table public.feedback enable row level security;
alter table public.questions enable row level security;
alter table public.help_requests enable row level security;

drop policy if exists "profiles select authenticated" on public.profiles;
create policy "profiles select authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles insert own student" on public.profiles;
create policy "profiles insert own student"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid() and role = 'student');

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "user_subjects select authenticated" on public.user_subjects;
create policy "user_subjects select authenticated"
  on public.user_subjects for select
  to authenticated
  using (true);

drop policy if exists "user_subjects insert own" on public.user_subjects;
create policy "user_subjects insert own"
  on public.user_subjects for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_subjects delete own" on public.user_subjects;
create policy "user_subjects delete own"
  on public.user_subjects for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "explanations select authenticated" on public.explanations;
create policy "explanations select authenticated"
  on public.explanations for select
  to authenticated
  using (true);

drop policy if exists "explanations insert own" on public.explanations;
create policy "explanations insert own"
  on public.explanations for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "explanations update own" on public.explanations;
create policy "explanations update own"
  on public.explanations for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "explanations delete own" on public.explanations;
create policy "explanations delete own"
  on public.explanations for delete
  to authenticated
  using (author_id = auth.uid());

drop policy if exists "votes select authenticated" on public.votes;
create policy "votes select authenticated"
  on public.votes for select
  to authenticated
  using (true);

drop policy if exists "votes insert own not self" on public.votes;
create policy "votes insert own not self"
  on public.votes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and not exists (
      select 1
      from public.explanations e
      where e.id = explanation_id
        and e.author_id = auth.uid()
    )
  );

drop policy if exists "votes delete own" on public.votes;
create policy "votes delete own"
  on public.votes for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "feedback select authenticated" on public.feedback;
create policy "feedback select authenticated"
  on public.feedback for select
  to authenticated
  using (true);

drop policy if exists "feedback insert own" on public.feedback;
create policy "feedback insert own"
  on public.feedback for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (
      parent_id is null
      or exists (
        select 1
        from public.explanations e
        where e.id = explanation_id
          and e.author_id = auth.uid()
      )
    )
  );

drop policy if exists "feedback update own" on public.feedback;
create policy "feedback update own"
  on public.feedback for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "feedback delete own" on public.feedback;
create policy "feedback delete own"
  on public.feedback for delete
  to authenticated
  using (author_id = auth.uid());

drop policy if exists "questions select authenticated" on public.questions;
create policy "questions select authenticated"
  on public.questions for select
  to authenticated
  using (true);

drop policy if exists "questions insert own" on public.questions;
create policy "questions insert own"
  on public.questions for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "questions delete own" on public.questions;
create policy "questions delete own"
  on public.questions for delete
  to authenticated
  using (author_id = auth.uid());

drop policy if exists "help_requests select involved" on public.help_requests;
create policy "help_requests select involved"
  on public.help_requests for select
  to authenticated
  using (requester_id = auth.uid() or helper_id = auth.uid());

drop policy if exists "help_requests insert own" on public.help_requests;
create policy "help_requests insert own"
  on public.help_requests for insert
  to authenticated
  with check (requester_id = auth.uid() and helper_id <> auth.uid());

drop policy if exists "help_requests helper update" on public.help_requests;
create policy "help_requests helper update"
  on public.help_requests for update
  to authenticated
  using (helper_id = auth.uid())
  with check (helper_id = auth.uid());

revoke all on table public.profiles from anon, public;
revoke all on table public.user_subjects from anon, public;
revoke all on table public.explanations from anon, public;
revoke all on table public.votes from anon, public;
revoke all on table public.feedback from anon, public;
revoke all on table public.questions from anon, public;
revoke all on table public.help_requests from anon, public;

grant usage on schema public to authenticated;
grant select on table public.profiles, public.user_subjects, public.explanations, public.votes, public.feedback, public.questions, public.help_requests to authenticated;
grant select on public.subject_reputation to authenticated;
grant insert, update, delete on table public.profiles, public.explanations, public.feedback to authenticated;
grant insert, delete on table public.user_subjects, public.votes, public.questions to authenticated;
grant insert, update on table public.help_requests to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_grade smallint;
begin
  begin
    new_grade := nullif(new.raw_user_meta_data->>'grade', '')::smallint;
  exception
    when others then
      new_grade := null;
  end;

  if new_grade is not null and (new_grade < 7 or new_grade > 12) then
    new_grade := null;
  end if;

  insert into public.profiles (id, display_name, grade, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
    new_grade,
    'student'
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        grade = coalesce(excluded.grade, public.profiles.grade);

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

notify pgrst, 'reload schema';

-- Promote a user to teacher (Phase 3). Run in the SQL editor, not from the app.
-- update public.profiles set role = 'teacher' where id = '<auth user uuid>';
