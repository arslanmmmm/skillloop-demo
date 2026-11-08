-- 001_chat.sql — Help chat for accepted help requests (Step 2, weeks 9–10)
-- Run this in the Supabase SQL Editor. Safe to re-run; it keeps your data.
-- schema.sql contains the same block, so a fresh setup only needs schema.sql.

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

notify pgrst, 'reload schema';
