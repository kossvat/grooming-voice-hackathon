-- Migration 003: Row Level Security
-- Authenticated studio members read their own studio's data only.
-- anon/authenticated have NO write access (writes go through service_role RPCs).
-- service_role bypasses RLS.

alter table studios         enable row level security;
alter table studio_members  enable row level security;
alter table staff           enable row level security;
alter table services        enable row level security;
alter table schedule_blocks enable row level security;
alter table customers       enable row level security;
alter table pets            enable row level security;
alter table conversations   enable row level security;
alter table offers          enable row level security;
alter table appointments    enable row level security;
alter table handoffs        enable row level security;
alter table tool_calls      enable row level security;

-- Helper: studio_ids the current authenticated user is a member of.
create or replace function my_studio_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select studio_id from studio_members where user_id = auth.uid();
$$;
revoke execute on function my_studio_ids() from public, anon;
grant execute on function my_studio_ids() to authenticated;

-- studios
create policy studios_read on studios
  for select to authenticated
  using (id in (select my_studio_ids()));

-- studio_members
create policy members_read on studio_members
  for select to authenticated
  using (studio_id in (select my_studio_ids()));

-- staff
create policy staff_read on staff
  for select to authenticated
  using (studio_id in (select my_studio_ids()));

-- services
create policy services_read on services
  for select to authenticated
  using (studio_id in (select my_studio_ids()));

-- schedule_blocks
create policy blocks_read on schedule_blocks
  for select to authenticated
  using (studio_id in (select my_studio_ids()));

-- customers
create policy customers_read on customers
  for select to authenticated
  using (studio_id in (select my_studio_ids()));

-- pets
create policy pets_read on pets
  for select to authenticated
  using (studio_id in (select my_studio_ids()));

-- conversations
create policy conversations_read on conversations
  for select to authenticated
  using (studio_id in (select my_studio_ids()));

-- offers
create policy offers_read on offers
  for select to authenticated
  using (studio_id in (select my_studio_ids()));

-- appointments
create policy appointments_read on appointments
  for select to authenticated
  using (studio_id in (select my_studio_ids()));

-- handoffs (read + update status only)
create policy handoffs_read on handoffs
  for select to authenticated
  using (studio_id in (select my_studio_ids()));

create policy handoffs_update on handoffs
  for update to authenticated
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

-- tool_calls: readable for conversations in the member's studios
create policy tool_calls_read on tool_calls
  for select to authenticated
  using (
    conversation_id in (
      select id from conversations where studio_id in (select my_studio_ids())
    )
  );

-- Read grants for authenticated members
grant select on studios, studio_members, staff, services, schedule_blocks to authenticated;
grant select on customers, pets, conversations, offers, appointments, handoffs, tool_calls to authenticated;
grant update (status) on handoffs to authenticated;
