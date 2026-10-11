-- SkillLoop Phase 2 additive migration
-- Run this if Phase 1 schema is already live and you want to keep existing data.
-- If you prefer a clean reset, run schema.sql instead (that drops all SkillLoop tables).

alter table public.feedback add column if not exists parent_id uuid references public.feedback (id) on delete cascade;

alter table public.feedback drop constraint if exists feedback_clarity_rating_check;
alter table public.feedback drop constraint if exists feedback_review_or_reply;
alter table public.feedback alter column clarity_rating drop not null;
alter table public.feedback
  add constraint feedback_review_or_reply check (
    (parent_id is null and clarity_rating between 1 and 5)
    or (parent_id is not null and clarity_rating is null)
  );

create unique index if not exists feedback_one_review
  on public.feedback (explanation_id, author_id)
  where parent_id is null;

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

create index if not exists questions_created_at_idx on public.questions (created_at desc);
create index if not exists help_requests_helper_idx on public.help_requests (helper_id, status);
create index if not exists help_requests_requester_idx on public.help_requests (requester_id);

create unique index if not exists help_requests_one_pending
  on public.help_requests (requester_id, helper_id, subject)
  where status = 'pending';

create or replace function public.enforce_feedback_rules()
returns trigger
language plpgsql
as $$
declare
  explanation_author uuid;
  parent_explanation uuid;
begin
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
  before insert on public.feedback
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

alter table public.questions enable row level security;
alter table public.help_requests enable row level security;

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

revoke all on table public.questions from anon, public;
revoke all on table public.help_requests from anon, public;
grant select on table public.questions, public.help_requests to authenticated;
grant insert, delete on table public.questions to authenticated;
grant insert, update on table public.help_requests to authenticated;

notify pgrst, 'reload schema';
