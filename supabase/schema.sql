-- SkillLoop Phase 1 schema
-- Paste and run this entire file in the Supabase SQL Editor.
-- Safe to re-run: it drops Phase 1 objects first.

create extension if not exists "pgcrypto";

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists votes_no_self_vote on public.votes;
drop trigger if exists profiles_protect_role on public.profiles;

drop view if exists public.subject_reputation cascade;
drop table if exists public.feedback cascade;
drop table if exists public.votes cascade;
drop table if exists public.user_subjects cascade;
drop table if exists public.explanations cascade;
drop table if exists public.reactions cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user();
drop function if exists public.prevent_self_vote();
drop function if exists public.protect_profile_role();

-- Subjects students asked for in the survey (keep in sync with src/config/subjects.js).
-- Later phases can add columns (e.g. video_url, hidden_at, verified_at) and
-- tables (help_requests, reports) without changing these core keys.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  grade smallint check (grade is null or grade between 7 and 12),
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

create table public.user_subjects (
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

create table public.explanations (
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

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  explanation_id uuid not null references public.explanations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (explanation_id, user_id)
);

-- Comments + clarity ratings (UI in Phase 2).
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  explanation_id uuid not null references public.explanations (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  clarity_rating smallint not null check (clarity_rating between 1 and 5),
  created_at timestamptz not null default now()
);

create index explanations_created_at_idx on public.explanations (created_at desc);
create index explanations_author_idx on public.explanations (author_id);
create index votes_explanation_idx on public.votes (explanation_id);
create index votes_user_idx on public.votes (user_id);
create index feedback_explanation_idx on public.feedback (explanation_id);
create index user_subjects_user_idx on public.user_subjects (user_id);

-- Reputation = votes from other students on that author’s explanations in a subject.
create view public.subject_reputation
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

create trigger votes_no_self_vote
  before insert on public.votes
  for each row execute function public.prevent_self_vote();

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

create trigger profiles_protect_role
  before insert or update on public.profiles
  for each row execute function public.protect_profile_role();

alter table public.profiles enable row level security;
alter table public.user_subjects enable row level security;
alter table public.explanations enable row level security;
alter table public.votes enable row level security;
alter table public.feedback enable row level security;

create policy "profiles select authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles insert own student"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid() and role = 'student');

create policy "profiles update own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "user_subjects select authenticated"
  on public.user_subjects for select
  to authenticated
  using (true);

create policy "user_subjects insert own"
  on public.user_subjects for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_subjects delete own"
  on public.user_subjects for delete
  to authenticated
  using (user_id = auth.uid());

create policy "explanations select authenticated"
  on public.explanations for select
  to authenticated
  using (true);

create policy "explanations insert own"
  on public.explanations for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "explanations update own"
  on public.explanations for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "explanations delete own"
  on public.explanations for delete
  to authenticated
  using (author_id = auth.uid());

create policy "votes select authenticated"
  on public.votes for select
  to authenticated
  using (true);

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

create policy "votes delete own"
  on public.votes for delete
  to authenticated
  using (user_id = auth.uid());

create policy "feedback select authenticated"
  on public.feedback for select
  to authenticated
  using (true);

create policy "feedback insert own"
  on public.feedback for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "feedback update own"
  on public.feedback for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "feedback delete own"
  on public.feedback for delete
  to authenticated
  using (author_id = auth.uid());

revoke all on table public.profiles from anon, public;
revoke all on table public.user_subjects from anon, public;
revoke all on table public.explanations from anon, public;
revoke all on table public.votes from anon, public;
revoke all on table public.feedback from anon, public;

grant usage on schema public to authenticated;
grant select on table public.profiles, public.user_subjects, public.explanations, public.votes, public.feedback to authenticated;
grant select on public.subject_reputation to authenticated;
grant insert, update, delete on table public.profiles, public.explanations, public.feedback to authenticated;
grant insert, delete on table public.user_subjects, public.votes to authenticated;

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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

notify pgrst, 'reload schema';

-- Promote a user to teacher (Phase 3). Run in the SQL editor, not from the app.
-- update public.profiles set role = 'teacher' where id = '<auth user uuid>';
