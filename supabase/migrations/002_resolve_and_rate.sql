-- 002_resolve_and_rate.sql — Resolve a help request and rate the helper (Step 3, weeks 9–10)
-- Run this in the Supabase SQL Editor after 001_chat.sql. Safe to re-run; it keeps your data.
-- schema.sql contains the same changes, so a fresh setup only needs schema.sql.

-- A request can now end as 'resolved'. Who resolved it and when is set by the
-- database, never by the browser.
alter table public.help_requests add column if not exists resolved_at timestamptz;
alter table public.help_requests add column if not exists resolved_by uuid references public.profiles (id) on delete set null;
alter table public.help_requests drop constraint if exists help_requests_status_check;
alter table public.help_requests
  add constraint help_requests_status_check
  check (status in ('pending', 'accepted', 'declined', 'resolved'));

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

-- Both students may update a request (the trigger decides which change each
-- may make). Previously only the helper could.
drop policy if exists "help_requests helper update" on public.help_requests;
drop policy if exists "help_requests participants update" on public.help_requests;
create policy "help_requests participants update"
  on public.help_requests for update
  to authenticated
  using (auth.uid() in (requester_id, helper_id))
  with check (auth.uid() in (requester_id, helper_id));

-- The chat becomes read-only once resolved without any change here: the
-- messages insert policy from 001_chat.sql only allows status = 'accepted'.

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

notify pgrst, 'reload schema';
