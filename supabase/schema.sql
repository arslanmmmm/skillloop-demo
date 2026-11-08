-- SkillLoop schema (Phase 1 + 2, plus migrations in supabase/migrations/)
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
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'resolved')),
  created_at timestamptz not null default now(),
  constraint help_requests_not_self check (requester_id <> helper_id)
);

-- What the student needs help with. Stored on the request, not in questions,
-- so only the requester and helper can read it (questions are visible to all).
-- New requests must have a topic (see protect_help_request); older rows may not.
alter table public.help_requests add column if not exists topic text;
alter table public.help_requests add column if not exists message text;
alter table public.help_requests drop constraint if exists help_requests_topic_length;
alter table public.help_requests
  add constraint help_requests_topic_length
  check (topic is null or char_length(trim(topic)) between 1 and 120);
alter table public.help_requests drop constraint if exists help_requests_message_length;
alter table public.help_requests
  add constraint help_requests_message_length
  check (message is null or char_length(trim(message)) between 1 and 1000);

-- A request can now end as 'resolved'. Who resolved it and when is set by the
-- database, never by the browser.
alter table public.help_requests add column if not exists resolved_at timestamptz;
alter table public.help_requests add column if not exists resolved_by uuid references public.profiles (id) on delete set null;
alter table public.help_requests drop constraint if exists help_requests_status_check;
alter table public.help_requests
  add constraint help_requests_status_check
  check (status in ('pending', 'accepted', 'declined', 'resolved'));

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

-- Allowed status changes:
--   pending  -> accepted | declined   only by the helper
--   accepted -> resolved              by either student (RLS limits updates to them)
-- Everything else is final. New requests always start as pending, so nobody can
-- create an already-accepted request and open a chat without the helper agreeing.
create or replace function public.protect_help_request()
returns trigger
language plpgsql
as $$
declare
  me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.requester_id = new.helper_id then
      raise exception 'You cannot request help from yourself'
        using errcode = 'P0001';
    end if;

    if coalesce(trim(new.topic), '') = '' then
      raise exception 'Say what topic you need help with'
        using errcode = 'P0001';
    end if;

    -- The attached question must be the requester's own and in the same subject.
    if new.question_id is not null and not exists (
      select 1
      from public.questions q
      where q.id = new.question_id
        and q.author_id = new.requester_id
        and q.subject = new.subject
    ) then
      raise exception 'The question must be yours and in the same subject'
        using errcode = 'P0001';
    end if;

    new.status := 'pending';
    new.resolved_at := null;
    new.resolved_by := null;
    return new;
  end if;

  if new.requester_id <> old.requester_id
    or new.helper_id <> old.helper_id
    or new.subject <> old.subject
    or new.question_id is distinct from old.question_id
    or new.topic is distinct from old.topic
    or new.message is distinct from old.message then
    raise exception 'Only the status of a request can change'
      using errcode = 'P0001';
  end if;

  new.resolved_at := old.resolved_at;
  new.resolved_by := old.resolved_by;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'pending' then
    if new.status not in ('accepted', 'declined') then
      raise exception 'A new request can only be accepted or declined'
        using errcode = 'P0001';
    end if;
    -- auth.uid() is null in the SQL editor, where an admin may fix data by hand.
    if me is not null and me <> old.helper_id then
      raise exception 'Only the helper can accept or decline this request'
        using errcode = 'P0001';
    end if;
  elsif old.status = 'accepted' then
    if new.status <> 'resolved' then
      raise exception 'An accepted request can only be marked as resolved'
        using errcode = 'P0001';
    end if;
    new.resolved_at := now();
    new.resolved_by := me;
  elsif old.status = 'resolved' then
    raise exception 'This request is already resolved'
      using errcode = 'P0001';
  else
    raise exception 'This request was already answered'
      using errcode = 'P0001';
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

-- Both students may update a request (the trigger decides which change each
-- may make). Previously only the helper could.
drop policy if exists "help_requests helper update" on public.help_requests;
drop policy if exists "help_requests participants update" on public.help_requests;
create policy "help_requests participants update"
  on public.help_requests for update
  to authenticated
  using (auth.uid() in (requester_id, helper_id))
  with check (auth.uid() in (requester_id, helper_id));

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

-- ---------------------------------------------------------------------------
-- Help chat (same as migrations/001_chat.sql)
-- ---------------------------------------------------------------------------

-- Text-only messages between the requester and the helper of one request.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.help_requests (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists messages_request_idx on public.messages (request_id, created_at);
create index if not exists messages_sender_recent_idx on public.messages (sender_id, created_at desc);

-- Rate limit: at most 5 messages per sender in any 10 seconds. created_at is
-- always set by the server, so a client cannot backdate messages to get round
-- the limit. The advisory lock makes two messages sent at the same instant
-- count one after the other.
create or replace function public.enforce_message_rules()
returns trigger
language plpgsql
as $$
declare
  recent integer;
begin
  new.created_at := now();
  perform pg_advisory_xact_lock(hashtext('messages:' || new.sender_id::text));
  select count(*) into recent
  from public.messages m
  where m.sender_id = new.sender_id
    and m.created_at > now() - interval '10 seconds';
  if recent >= 5 then
    raise exception 'You are sending messages too fast. Wait a few seconds and try again.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_rules on public.messages;
create trigger messages_rules
  before insert on public.messages
  for each row execute function public.enforce_message_rules();

alter table public.messages enable row level security;

-- Only the two students on the request can read its messages.
drop policy if exists "messages select participants" on public.messages;
create policy "messages select participants"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.help_requests r
      where r.id = request_id
        and auth.uid() in (r.requester_id, r.helper_id)
    )
  );

-- They can only send as themselves, and only while the request is accepted.
-- No update or delete policy: messages cannot be edited or removed by students.
drop policy if exists "messages insert participant while accepted" on public.messages;
create policy "messages insert participant while accepted"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.help_requests r
      where r.id = request_id
        and r.status = 'accepted'
        and auth.uid() in (r.requester_id, r.helper_id)
    )
  );

revoke all on table public.messages from anon, public;
grant select, insert on table public.messages to authenticated;

-- Live updates: Supabase Realtime sends new messages and request status
-- changes to the browser, still filtered by the policies above.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'help_requests'
    ) then
      alter publication supabase_realtime add table public.help_requests;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resolve + helper ratings (same as migrations/002_resolve_and_rate.sql)
-- ---------------------------------------------------------------------------

-- One rating per resolved request, given by the student who asked for help.
create table if not exists public.help_ratings (
  request_id uuid primary key references public.help_requests (id) on delete cascade,
  rater_id uuid not null references public.profiles (id) on delete cascade,
  helper_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(trim(comment)) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists help_ratings_helper_idx on public.help_ratings (helper_id);

-- helper_id is copied from the request, so a rating can never be pointed at
-- someone who did not help.
create or replace function public.enforce_help_rating()
returns trigger
language plpgsql
as $$
declare
  req public.help_requests%rowtype;
begin
  select * into req from public.help_requests where id = new.request_id;
  if not found then
    raise exception 'Help request not found' using errcode = 'P0001';
  end if;
  if req.status <> 'resolved' then
    raise exception 'You can rate the help once the request is resolved'
      using errcode = 'P0001';
  end if;
  if new.rater_id <> req.requester_id then
    raise exception 'Only the student who asked for help can rate it'
      using errcode = 'P0001';
  end if;
  new.helper_id := req.helper_id;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists help_ratings_rules on public.help_ratings;
create trigger help_ratings_rules
  before insert on public.help_ratings
  for each row execute function public.enforce_help_rating();

alter table public.help_ratings enable row level security;

-- A rating and its comment are visible only to the rater and the helper.
drop policy if exists "help_ratings select rater or helper" on public.help_ratings;
create policy "help_ratings select rater or helper"
  on public.help_ratings for select
  to authenticated
  using (auth.uid() in (rater_id, helper_id));

-- No update or delete policy: a rating is final.
drop policy if exists "help_ratings insert own" on public.help_ratings;
create policy "help_ratings insert own"
  on public.help_ratings for insert
  to authenticated
  with check (rater_id = auth.uid());

revoke all on table public.help_ratings from anon, public;
grant select, insert on table public.help_ratings to authenticated;

-- Everyone can see a helper's average and count, but not individual ratings
-- or comments. This view deliberately runs with its owner's rights (not
-- security_invoker) so it can average rows the viewer cannot read; it only
-- ever returns these aggregates.
create or replace view public.helper_rating_summary as
select
  helper_id,
  round(avg(rating)::numeric, 1) as average,
  count(*)::integer as ratings
from public.help_ratings
group by helper_id;

revoke all on public.helper_rating_summary from anon, public;
grant select on public.helper_rating_summary to authenticated;

-- Live updates: a helper sees a new rating (and their new average) without a reload.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'help_ratings'
    ) then
    alter publication supabase_realtime add table public.help_ratings;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Teacher review (same as migrations/003_teacher_review.sql)
-- ---------------------------------------------------------------------------

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

-- Promote a user to teacher (Phase 3). Run in the SQL editor, not from the app.
-- update public.profiles set role = 'teacher' where id = '<auth user uuid>';
