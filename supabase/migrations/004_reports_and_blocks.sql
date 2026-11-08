-- 004_reports_and_blocks.sql — Safety: report content and block students (Step 5, weeks 9–10)
-- Run this in the Supabase SQL Editor after 003. Safe to re-run; it keeps your data.
-- schema.sql contains the same block, so a fresh setup only needs schema.sql.

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

-- A student reports one chat message or one explanation. The reported text is
-- copied into the report (snapshot), so a teacher can read a reported chat
-- message without being able to read any chat.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('message', 'explanation')),
  message_id uuid references public.messages (id) on delete set null,
  explanation_id uuid references public.explanations (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('wrong_info', 'copied', 'rude', 'other')),
  details text,
  snapshot_title text,
  snapshot text not null default '',
  status text not null default 'open' check (status in ('open', 'handled')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  -- At most one target; it can become null later if the post or chat is deleted.
  constraint reports_one_target check (num_nonnulls(message_id, explanation_id) <= 1)
);

alter table public.reports drop constraint if exists reports_details_check;
alter table public.reports
  add constraint reports_details_check
  check (details is null or char_length(trim(details)) between 1 and 500);

create index if not exists reports_status_created_idx on public.reports (status, created_at desc);
create index if not exists reports_reporter_idx on public.reports (reporter_id);

-- One report per student per message or explanation.
create unique index if not exists reports_one_per_message
  on public.reports (reporter_id, message_id)
  where message_id is not null;
create unique index if not exists reports_one_per_explanation
  on public.reports (reporter_id, explanation_id)
  where explanation_id is not null;

-- New report: check the reporter may see the target, copy its text and author,
-- and start it as open. Runs with the reporter's rights, so RLS decides what
-- they can see: a chat message only if they are in that chat, an explanation
-- only if it is visible to them.
-- Update: only teachers, and only the status; who handled it and when is set here.
create or replace function public.enforce_report_rules()
returns trigger
language plpgsql
as $$
declare
  me uuid := auth.uid();
  msg public.messages%rowtype;
  post public.explanations%rowtype;
begin
  if tg_op = 'UPDATE' then
    if me is not null and not public.is_teacher() then
      raise exception 'Only teachers can update reports' using errcode = 'P0001';
    end if;
    if new.reporter_id is distinct from old.reporter_id
      or new.target_type is distinct from old.target_type
      or new.message_id is distinct from old.message_id
      or new.explanation_id is distinct from old.explanation_id
      or new.reported_user_id is distinct from old.reported_user_id
      or new.reason is distinct from old.reason
      or new.details is distinct from old.details
      or new.snapshot_title is distinct from old.snapshot_title
      or new.snapshot is distinct from old.snapshot
      or new.created_at is distinct from old.created_at then
      raise exception 'Only the status of a report can change' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status then
      new.handled_by := case when new.status = 'handled' then me else null end;
      new.handled_at := case when new.status = 'handled' then now() else null end;
    else
      new.handled_by := old.handled_by;
      new.handled_at := old.handled_at;
    end if;
    return new;
  end if;

  new.details := nullif(trim(new.details), '');
  new.status := 'open';
  new.handled_by := null;
  new.handled_at := null;
  new.created_at := now();

  if new.target_type = 'message' then
    if new.message_id is null or new.explanation_id is not null then
      raise exception 'Pick the message you want to report' using errcode = 'P0001';
    end if;
    select * into msg from public.messages where id = new.message_id;
    if not found then
      raise exception 'That message was not found' using errcode = 'P0001';
    end if;
    if msg.sender_id = new.reporter_id then
      raise exception 'You cannot report your own message' using errcode = 'P0001';
    end if;
    new.reported_user_id := msg.sender_id;
    new.snapshot_title := null;
    new.snapshot := msg.body;
  else
    if new.explanation_id is null or new.message_id is not null then
      raise exception 'Pick the explanation you want to report' using errcode = 'P0001';
    end if;
    select * into post from public.explanations where id = new.explanation_id;
    if not found then
      raise exception 'That explanation was not found' using errcode = 'P0001';
    end if;
    if post.author_id = new.reporter_id then
      raise exception 'You cannot report your own explanation' using errcode = 'P0001';
    end if;
    new.reported_user_id := post.author_id;
    new.snapshot_title := post.title;
    new.snapshot := post.body;
  end if;

  return new;
end;
$$;

drop trigger if exists reports_rules on public.reports;
create trigger reports_rules
  before insert or update on public.reports
  for each row execute function public.enforce_report_rules();

alter table public.reports enable row level security;

-- The reported student can never read a report, so they never learn who reported them.
drop policy if exists "reports select own or teacher" on public.reports;
create policy "reports select own or teacher"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid() or public.is_teacher());

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- No delete policy: a report stays on record.
drop policy if exists "reports teacher update" on public.reports;
create policy "reports teacher update"
  on public.reports for update
  to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

revoke all on table public.reports from anon, public;
grant select, insert, update on table public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------

create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

-- Only the blocker sees their block list; the blocked student is not told.
drop policy if exists "blocks select own" on public.blocks;
create policy "blocks select own"
  on public.blocks for select
  to authenticated
  using (blocker_id = auth.uid());

-- Teachers cannot be blocked.
drop policy if exists "blocks insert own" on public.blocks;
create policy "blocks insert own"
  on public.blocks for insert
  to authenticated
  with check (
    blocker_id = auth.uid()
    and not exists (
      select 1 from public.profiles p where p.id = blocked_id and p.role = 'teacher'
    )
  );

drop policy if exists "blocks delete own" on public.blocks;
create policy "blocks delete own"
  on public.blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

revoke all on table public.blocks from anon, public;
grant select, insert, delete on table public.blocks to authenticated;

-- Runs with the owner's rights because a blocked student cannot read the
-- blocker's row (see "blocks select own"). Triggers run before RLS checks the
-- new row, so rows a student is not allowed to write are skipped here and left
-- for RLS to reject; otherwise the error could reveal who blocked whom. The
-- error text does not say "blocked", so the blocked student is not told.
--   * Bug #16: the helper must teach (offer) the subject.
--   * Nobody can send a request to, or accept one from, a student when either
--     of them has blocked the other.
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

drop trigger if exists help_requests_safety on public.help_requests;
create trigger help_requests_safety
  before insert or update on public.help_requests
  for each row execute function public.check_help_request_safety();

-- No new messages in a chat once either student has blocked the other.
-- Same rules as above: only the sender's own messages in their own chat are
-- checked here, and the error reads like any closed chat.
create or replace function public.check_message_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is not null and (
    me <> new.sender_id
    or not exists (
      select 1 from public.help_requests r
      where r.id = new.request_id and me in (r.requester_id, r.helper_id)
    )
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.help_requests r
    join public.blocks b
      on (b.blocker_id = r.requester_id and b.blocked_id = r.helper_id)
      or (b.blocker_id = r.helper_id and b.blocked_id = r.requester_id)
    where r.id = new.request_id
  ) then
    raise exception 'This chat is closed, so new messages cannot be sent.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.check_message_safety() from public, anon, authenticated;

drop trigger if exists messages_safety on public.messages;
create trigger messages_safety
  before insert on public.messages
  for each row execute function public.check_message_safety();

-- The blocker no longer sees the blocked student's explanations (the Step 4
-- rules for hidden posts still apply).
drop policy if exists "explanations select visible" on public.explanations;
create policy "explanations select visible"
  on public.explanations for select
  to authenticated
  using (
    (review_status <> 'hidden' or author_id = auth.uid() or public.is_teacher())
    and not exists (
      select 1 from public.blocks b
      where b.blocker_id = auth.uid() and b.blocked_id = author_id
    )
  );

notify pgrst, 'reload schema';
