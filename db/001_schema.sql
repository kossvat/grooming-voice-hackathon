-- Migration 001: full schema for Grooming Voice MVP
-- Apply via Supabase dashboard SQL editor or authenticated MCP.
-- Public schema is LIVE VERIFIED EMPTY before this runs.
-- All tables tenant-scoped by studio_id; cross-tenant integrity enforced by
-- triggers (not merely FK), so a caller can never attach another studio's
-- staff/pet/service/conversation/offer to a booking.

-- --------------------------------------------------------------------------
-- Extensions
-- --------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid, digest
create extension if not exists "btree_gist";    -- EXCLUDE USING GIST

-- --------------------------------------------------------------------------
-- Studios
-- --------------------------------------------------------------------------
create table studios (
  id                     text        primary key,
  name                   text        not null,
  timezone               text        not null default 'America/New_York',
  demo_mode              boolean     not null default false,
  policy_version         int         not null default 1,
  accept_new_sessions    boolean     not null default true,
  accept_bookings        boolean     not null default true,
  -- JSON: [{"weekday":"tuesday","open":"09:00","close":"18:00"},{"weekday":"monday","closed":true},...]
  weekly_hours           jsonb       not null default '[]',
  booking_horizon_days   int         not null default 14,
  slot_step_minutes      int         not null default 15,
  cleanup_buffer_minutes int         not null default 15,
  created_at             timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Studio members (Auth users bound to a studio with a role)
-- --------------------------------------------------------------------------
create table studio_members (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  studio_id   text        not null references studios(id) on delete cascade,
  role        text        not null check (role in ('staff','owner','operator')),
  created_at  timestamptz not null default now(),
  primary key (user_id, studio_id)
);

-- --------------------------------------------------------------------------
-- Staff
-- --------------------------------------------------------------------------
create table staff (
  id           text        primary key,
  studio_id    text        not null references studios(id) on delete cascade,
  name         text        not null,
  service_ids  jsonb       not null default '[]',   -- array of service ids
  daily_break  jsonb,                               -- {"start":"HH:mm","end":"HH:mm"}
  created_at   timestamptz not null default now()
);
create index on staff (studio_id);

-- --------------------------------------------------------------------------
-- Services
-- --------------------------------------------------------------------------
create table services (
  id                    text        primary key,
  studio_id             text        not null references studios(id) on delete cascade,
  family                text        not null,      -- 'bath' | 'full_groom'
  size_band             text        not null,      -- 'S' | 'M'
  name                  text        not null,
  starting_price_cents  int         not null check (starting_price_cents > 0),
  currency              text        not null default 'USD',
  quote_type            text        not null default 'starting_from',
  duration_minutes      int         not null check (duration_minutes > 0),
  buffer_minutes        int         not null default 15,
  version               int         not null default 1,
  created_at            timestamptz not null default now()
);
create index on services (studio_id);

-- --------------------------------------------------------------------------
-- Schedule blocks (one-off; breaks live on staff.daily_break)
-- --------------------------------------------------------------------------
create table schedule_blocks (
  id          bigint      generated always as identity primary key,
  studio_id   text        not null references studios(id) on delete cascade,
  staff_id    text        not null references staff(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text        not null default 'block',
  constraint schedule_blocks_order check (starts_at < ends_at)
);
create index on schedule_blocks (staff_id, starts_at, ends_at);

-- --------------------------------------------------------------------------
-- Customers
-- --------------------------------------------------------------------------
create table customers (
  id          uuid        primary key default gen_random_uuid(),
  studio_id   text        not null references studios(id) on delete cascade,
  name        text        not null,
  phone       text,
  source      text        not null default 'voice' check (source in ('voice','manual','seed')),
  created_at  timestamptz not null default now()
);
create index on customers (studio_id);

-- --------------------------------------------------------------------------
-- Pets
-- --------------------------------------------------------------------------
create table pets (
  id          uuid        primary key default gen_random_uuid(),
  studio_id   text        not null references studios(id) on delete cascade,
  customer_id uuid        not null references customers(id) on delete cascade,
  name        text        not null,
  species     text        not null default 'dog',
  breed       text,
  weight_kg   numeric(6,3),
  notes       text,
  created_at  timestamptz not null default now(),
  constraint pets_weight_positive check (weight_kg is null or weight_kg > 0)
);
create index on pets (studio_id, customer_id);

-- --------------------------------------------------------------------------
-- Conversations (one per ElevenLabs session)
-- --------------------------------------------------------------------------
create table conversations (
  id                            uuid        primary key default gen_random_uuid(),
  studio_id                     text        not null references studios(id) on delete cascade,
  -- Provider (ElevenLabs) conversation id; prebound on session creation.
  provider_conversation_id      text        not null unique,
  -- Policy/version hash: invalidates offers when prices/hours change mid-session.
  capability_hash               text        not null,
  -- Runtime credential: hash of a random session capability; distinct from
  -- the policy hash. Verified (timing-safe) by the HTTP layer, never in RPCs.
  session_capability_hash       text        not null unique,
  session_capability_expires_at timestamptz not null,
  -- Current search generation; incremented under a row lock.
  search_generation             int         not null default 0,
  expires_at                    timestamptz not null,
  status                        text        not null default 'active'
                                  check (status in ('active','completed','abandoned')),
  created_at                    timestamptz not null default now()
);
create index on conversations (studio_id);

-- --------------------------------------------------------------------------
-- Offers (availability results surfaced to a conversation)
-- --------------------------------------------------------------------------
create table offers (
  id                   uuid        primary key default gen_random_uuid(),
  conversation_id      uuid        not null references conversations(id) on delete cascade,
  studio_id            text        not null references studios(id) on delete cascade,
  generation           int         not null,
  staff_id             text        not null references staff(id),
  -- snapshot of service + pet at offer time (prices/durations can change)
  service_snapshot     jsonb       not null,
  pet_snapshot         jsonb,
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  occupied_until       timestamptz not null,
  expires_at           timestamptz not null,
  status               text        not null default 'pending'
                         check (status in ('pending','accepted','superseded','expired')),
  created_at           timestamptz not null default now(),
  constraint offers_order check (starts_at < ends_at and ends_at <= occupied_until)
);
create index on offers (conversation_id, generation);
create index on offers (staff_id, starts_at, occupied_until);

-- --------------------------------------------------------------------------
-- Appointments
-- --------------------------------------------------------------------------
create table appointments (
  id                   uuid        primary key default gen_random_uuid(),
  studio_id            text        not null references studios(id) on delete cascade,
  conversation_id      uuid        references conversations(id),
  offer_id             uuid        unique references offers(id),   -- idempotency key
  customer_id          uuid        not null references customers(id),
  pet_id               uuid        not null references pets(id),
  staff_id             text        not null references staff(id),
  service_id           text        not null references services(id),
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  occupied_until       timestamptz not null,
  quoted_price_cents   int         not null check (quoted_price_cents > 0),
  status               text        not null default 'confirmed'
                         check (status in ('confirmed','cancelled','no_show')),
  source               text        not null default 'voice'
                         check (source in ('voice','manual','seed')),
  notes                text,
  created_at           timestamptz not null default now(),
  constraint appointments_order check (starts_at < ends_at and ends_at <= occupied_until)
);
create index on appointments (studio_id, starts_at);
create index on appointments (staff_id, starts_at, occupied_until);
create index on appointments (conversation_id);
create index on appointments (offer_id);

-- One confirmed booking per conversation (nullable conversation_id is fine:
-- Postgres treats NULLs as distinct in unique indexes).
create unique index appointments_one_confirmed_per_conversation
  on appointments (conversation_id)
  where (status = 'confirmed');

-- Cleanup-inclusive overlap exclusion: two confirmed appointments for the
-- same groomer may not have overlapping [starts_at, occupied_until).
alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, occupied_until, '[)') with &&
  )
  where (status = 'confirmed');

-- --------------------------------------------------------------------------
-- Handoffs (staff follow-up tasks)
-- --------------------------------------------------------------------------
create table handoffs (
  id               uuid        primary key default gen_random_uuid(),
  studio_id        text        not null references studios(id) on delete cascade,
  conversation_id  uuid        references conversations(id),
  reason           text        not null,
  summary          text,
  callback_contact text,
  booking_id       uuid        references appointments(id),
  status           text        not null default 'open'
                     check (status in ('open','called','resolved')),
  created_at       timestamptz not null default now(),
  constraint handoffs_dedup unique (conversation_id, reason)
);
create index on handoffs (studio_id, status);

-- --------------------------------------------------------------------------
-- Tool call log
-- --------------------------------------------------------------------------
create table tool_calls (
  request_id       text        primary key,
  conversation_id  uuid        references conversations(id),
  tool_name        text        not null,
  started_at       timestamptz not null default now(),
  duration_ms      int,
  outcome          text        not null check (outcome in ('ok','error','handoff')),
  redacted_summary text
);
create index on tool_calls (conversation_id);

-- --------------------------------------------------------------------------
-- Cross-tenant integrity triggers (defense-in-depth beyond FKs)
-- --------------------------------------------------------------------------

-- schedule_blocks.staff_id must belong to the same studio
create or replace function trg_check_block_studio()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from staff where id = new.staff_id and studio_id = new.studio_id
  ) then
    raise exception 'staff % does not belong to studio %', new.staff_id, new.studio_id;
  end if;
  return new;
end;
$$;
create trigger check_block_studio
  before insert or update on schedule_blocks
  for each row execute function trg_check_block_studio();

-- offers: staff and conversation must belong to the same studio
create or replace function trg_check_offer_studio()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from staff where id = new.staff_id and studio_id = new.studio_id
  ) then
    raise exception 'staff % does not belong to studio %', new.staff_id, new.studio_id;
  end if;
  if not exists (
    select 1 from conversations where id = new.conversation_id and studio_id = new.studio_id
  ) then
    raise exception 'conversation % does not belong to studio %', new.conversation_id, new.studio_id;
  end if;
  return new;
end;
$$;
create trigger check_offer_studio
  before insert or update on offers
  for each row execute function trg_check_offer_studio();

-- pets: customer must belong to the same studio
create or replace function trg_check_pet_studio()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from customers where id = new.customer_id and studio_id = new.studio_id
  ) then
    raise exception 'customer % does not belong to studio %', new.customer_id, new.studio_id;
  end if;
  return new;
end;
$$;
create trigger check_pet_studio
  before insert or update on pets
  for each row execute function trg_check_pet_studio();

-- appointments: customer/pet/staff/service/conversation must all be same studio
create or replace function trg_check_appt_studio()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from customers  where id = new.customer_id and studio_id = new.studio_id) then
    raise exception 'customer % does not belong to studio %', new.customer_id, new.studio_id;
  end if;
  if not exists (select 1 from pets       where id = new.pet_id and customer_id = new.customer_id and studio_id = new.studio_id) then
    raise exception 'pet % does not belong to customer % in studio %', new.pet_id, new.customer_id, new.studio_id;
  end if;
  if not exists (select 1 from staff      where id = new.staff_id and studio_id = new.studio_id) then
    raise exception 'staff % does not belong to studio %', new.staff_id, new.studio_id;
  end if;
  if not exists (select 1 from services   where id = new.service_id and studio_id = new.studio_id) then
    raise exception 'service % does not belong to studio %', new.service_id, new.studio_id;
  end if;
  if new.conversation_id is not null and not exists (
    select 1 from conversations where id = new.conversation_id and studio_id = new.studio_id
  ) then
    raise exception 'conversation % does not belong to studio %', new.conversation_id, new.studio_id;
  end if;
  return new;
end;
$$;
create trigger check_appt_studio
  before insert or update on appointments
  for each row execute function trg_check_appt_studio();

-- handoffs: conversation and booking must belong to the same studio (when set)
create or replace function trg_check_handoff_studio()
returns trigger language plpgsql as $$
begin
  if new.conversation_id is not null and not exists (
    select 1 from conversations where id = new.conversation_id and studio_id = new.studio_id
  ) then
    raise exception 'conversation % does not belong to studio %', new.conversation_id, new.studio_id;
  end if;
  if new.booking_id is not null and not exists (
    select 1 from appointments where id = new.booking_id and studio_id = new.studio_id
  ) then
    raise exception 'booking % does not belong to studio %', new.booking_id, new.studio_id;
  end if;
  return new;
end;
$$;
create trigger check_handoff_studio
  before insert or update on handoffs
  for each row execute function trg_check_handoff_studio();
