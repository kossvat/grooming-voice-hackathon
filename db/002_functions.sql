-- Migration 002: atomic RPC functions
--
-- SECURITY: every function here is SECURITY DEFINER and executable by
-- service_role ONLY (explicit revokes from public/anon/authenticated below).
-- The trusted HTTP layer (our Next.js routes) verifies the static tool secret
-- and the per-session capability and provider-conversation binding, then calls
-- these RPCs with the service_role key. Tenant is always derived from the
-- conversation row — never trusted from a caller-supplied studio_id.

-- --------------------------------------------------------------------------
-- Helpers (not exposed to HTTP; service_role only)
-- --------------------------------------------------------------------------

-- Policy/version hash: prices/services/policy version. Folded into
-- conversations.capability_hash so a mid-session price change invalidates
-- offers. Schedule (hours/blocks/breaks) is NOT in this hash — it is instead
-- revalidated live at booking commit (see create_booking).
create or replace function studio_capability_hash(p_studio_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(extensions.digest(
    p_studio_id
    || ':' || s.policy_version::text
    || ':' || coalesce(
         (select string_agg(id || '.' || version::text, ',' order by id)
          from services where studio_id = p_studio_id),
         ''
       ),
    'sha256'
  ), 'hex')
  from studios s where s.id = p_studio_id;
$$;

-- Size band from weight: 'S' (0<kg<=10), 'M' (10<kg<=20), null otherwise.
create or replace function resolve_size_band(p_weight_kg numeric)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when p_weight_kg is null or p_weight_kg <= 0 then null
    when p_weight_kg <= 10 then 'S'
    when p_weight_kg <= 20 then 'M'
    else null
  end;
$$;

-- --------------------------------------------------------------------------
-- create_conversation: called by POST /api/voice/session AFTER the ElevenLabs
-- token endpoint has returned a provider conversation_id. Stores the hash of a
-- freshly generated session capability (the plaintext lives only in the
-- browser page and is verified by the HTTP layer, never in SQL).
-- --------------------------------------------------------------------------
create or replace function create_conversation(
  p_studio_id                   text,
  p_provider_conversation_id    text,
  p_session_capability_hash     text,
  p_session_capability_ttl_minutes int default 30,
  p_ttl_minutes                 int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  conversations;
  v_hash text;
begin
  if not exists (
    select 1 from studios where id = p_studio_id and accept_new_sessions = true
  ) then
    raise exception 'studio_not_accepting_sessions';
  end if;
  if p_provider_conversation_id is null or p_provider_conversation_id = '' then
    raise exception 'provider_conversation_id_required';
  end if;
  if p_session_capability_hash is null or p_session_capability_hash = '' then
    raise exception 'session_capability_hash_required';
  end if;

  v_hash := studio_capability_hash(p_studio_id);

  insert into conversations (
    studio_id, provider_conversation_id, capability_hash,
    session_capability_hash, session_capability_expires_at,
    search_generation, expires_at, status
  ) values (
    p_studio_id, p_provider_conversation_id, v_hash,
    p_session_capability_hash,
    now() + make_interval(mins => p_session_capability_ttl_minutes),
    0,
    now() + make_interval(mins => p_ttl_minutes),
    'active'
  ) returning * into v_row;

  return jsonb_build_object(
    'id',               v_row.id,
    'studioId',         v_row.studio_id,
    'capabilityHash',   v_row.capability_hash,
    'searchGeneration', v_row.search_generation,
    'expiresAt',        v_row.expires_at
  );
end;
$$;

-- --------------------------------------------------------------------------
-- find_available_slots: increments search_generation under a row lock,
-- supersedes prior pending offers, then publishes up to 3 clean slots
-- (cleanup-inclusive). Each returned slot carries its persisted offer id.
-- Pet weight/species are bound into each offer snapshot.
-- --------------------------------------------------------------------------
create or replace function find_available_slots(
  p_conversation_id uuid,
  p_service_id      text,
  p_date_str        text,          -- 'YYYY-MM-DD' studio-local
  p_earliest_time   text default null,  -- 'HH:mm' optional filter
  p_pet_weight_kg   numeric default null,
  p_pet_species     text default 'dog'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv       conversations;
  v_studio     studios;
  v_service    services;
  v_generation int;
  v_band       text;
  v_slots      jsonb := '[]'::jsonb;
  v_count      int := 0;
  v_max        int := 3;
  v_step       interval;
  v_hours      jsonb;
  v_weekday    text;
  v_open_at    timestamptz;
  v_close_at   timestamptz;
  v_earliest   timestamptz;
  v_candidate  timestamptz;
  v_end_at     timestamptz;
  v_occ_until  timestamptz;
  v_break_start timestamptz;
  v_break_end   timestamptz;
  v_conflict   boolean;
  v_offer      offers;
  v_staff_rec  record;
  v_pet_snap   jsonb;
begin
  -- Lock the conversation row: serializes searches and bookings per session.
  select * into v_conv from conversations
  where id = p_conversation_id and status = 'active' and expires_at > now()
  for update;
  if not found then
    raise exception 'invalid_or_expired_conversation';
  end if;

  select * into v_studio from studios where id = v_conv.studio_id;

  if v_conv.capability_hash != studio_capability_hash(v_conv.studio_id) then
    raise exception 'capability_hash_mismatch';
  end if;

  select * into v_service
  from services where id = p_service_id and studio_id = v_conv.studio_id;
  if not found then
    raise exception 'unknown_service';
  end if;

  -- Pet eligibility is bound to the offers we publish.
  if p_pet_species is not null and p_pet_species <> 'dog' then
    return jsonb_build_object('slots', '[]'::jsonb, 'reason', 'unsupported_species');
  end if;
  v_band := resolve_size_band(p_pet_weight_kg);
  if p_pet_weight_kg is not null and v_band is null then
    return jsonb_build_object('slots', '[]'::jsonb, 'reason', 'weight_handoff');
  end if;
  if p_pet_weight_kg is not null and v_band <> v_service.size_band then
    return jsonb_build_object('slots', '[]'::jsonb, 'reason', 'size_band_mismatch');
  end if;
  v_pet_snap := case
    when p_pet_weight_kg is null then null
    else jsonb_build_object('species', p_pet_species, 'weightKg', p_pet_weight_kg, 'sizeBand', v_band)
  end;

  -- Atomically bump generation (we hold the row lock).
  v_generation := v_conv.search_generation + 1;
  update conversations set search_generation = v_generation where id = p_conversation_id;
  update offers set status = 'superseded'
  where conversation_id = p_conversation_id and status = 'pending';

  -- Deterministic weekday from the calendar date (no session-TZ dependency).
  v_weekday := lower(to_char(p_date_str::date, 'FMDay'));

  select elem into v_hours
  from jsonb_array_elements(v_studio.weekly_hours) as elem
  where elem->>'weekday' = v_weekday;

  if v_hours is null or coalesce((v_hours->>'closed')::boolean, false) then
    return jsonb_build_object('slots', '[]'::jsonb, 'reason', 'closed_day', 'generation', v_generation);
  end if;

  v_open_at  := (p_date_str || 'T' || (v_hours->>'open')  || ':00')::timestamp at time zone v_studio.timezone;
  v_close_at := (p_date_str || 'T' || (v_hours->>'close') || ':00')::timestamp at time zone v_studio.timezone;

  -- Horizon + past-date enforcement (studio-local today).
  if p_date_str::date < (now() at time zone v_studio.timezone)::date then
    return jsonb_build_object('slots', '[]'::jsonb, 'reason', 'past_date', 'generation', v_generation);
  end if;
  if p_date_str::date > ((now() at time zone v_studio.timezone)::date + (v_studio.booking_horizon_days || ' days')::interval)::date then
    return jsonb_build_object('slots', '[]'::jsonb, 'reason', 'beyond_horizon', 'generation', v_generation);
  end if;

  if p_earliest_time is not null then
    v_earliest := (p_date_str || 'T' || p_earliest_time || ':00')::timestamp at time zone v_studio.timezone;
    if v_earliest > v_open_at then
      v_open_at := v_earliest;
    end if;
  end if;

  v_step := make_interval(mins => v_studio.slot_step_minutes);

  for v_staff_rec in
    select id, daily_break from staff
    where studio_id = v_conv.studio_id and service_ids ? p_service_id
  loop
    v_candidate := v_open_at;
    while v_candidate <= v_close_at and v_count < v_max loop
      v_end_at    := v_candidate + make_interval(mins => v_service.duration_minutes);
      v_occ_until := v_end_at   + make_interval(mins => v_service.buffer_minutes);

      -- Must fit entirely before close.
      if v_occ_until > v_close_at then
        exit;
      end if;

      -- No past slots on today.
      if v_candidate <= now() then
        v_candidate := v_candidate + v_step;
        continue;
      end if;

      v_conflict := false;

      if v_staff_rec.daily_break is not null then
        v_break_start := (p_date_str || 'T' || (v_staff_rec.daily_break->>'start') || ':00')::timestamp at time zone v_studio.timezone;
        v_break_end   := (p_date_str || 'T' || (v_staff_rec.daily_break->>'end')   || ':00')::timestamp at time zone v_studio.timezone;
        if v_candidate < v_break_end and v_occ_until > v_break_start then
          v_conflict := true;
        end if;
      end if;

      if not v_conflict then
        select exists(
          select 1 from schedule_blocks sb
          where sb.staff_id = v_staff_rec.id
            and sb.starts_at < v_occ_until and sb.ends_at > v_candidate
        ) into v_conflict;
      end if;

      if not v_conflict then
        select exists(
          select 1 from appointments a
          where a.staff_id = v_staff_rec.id
            and a.status = 'confirmed'
            and a.starts_at < v_occ_until and a.occupied_until > v_candidate
        ) into v_conflict;
      end if;

      if not v_conflict then
        insert into offers (
          conversation_id, studio_id, generation, staff_id,
          service_snapshot, pet_snapshot,
          starts_at, ends_at, occupied_until, expires_at, status
        ) values (
          p_conversation_id, v_conv.studio_id, v_generation, v_staff_rec.id,
          jsonb_build_object(
            'id', v_service.id,
            'name', v_service.name,
            'sizeBand', v_service.size_band,
            'startingPriceCents', v_service.starting_price_cents,
            'currency', v_service.currency,
            'durationMinutes', v_service.duration_minutes,
            'bufferMinutes', v_service.buffer_minutes,
            'version', v_service.version
          ),
          v_pet_snap,
          v_candidate, v_end_at, v_occ_until,
          now() + interval '5 minutes',
          'pending'
        ) returning * into v_offer;

        v_slots := v_slots || jsonb_build_object(
          'offerId',            v_offer.id,
          'staffId',            v_staff_rec.id,
          'staffName',          (select name from staff where id = v_staff_rec.id),
          'serviceId',          v_service.id,
          'serviceName',        v_service.name,
          'startsAt',           v_candidate,
          'endsAt',             v_end_at,
          'occupiedUntil',      v_occ_until,
          'startingPriceCents', v_service.starting_price_cents,
          'currency',           v_service.currency
        );
        v_count := v_count + 1;
      end if;

      v_candidate := v_candidate + v_step;
    end loop;

    exit when v_count >= v_max;
  end loop;

  return jsonb_build_object('slots', v_slots, 'generation', v_generation);
end;
$$;

-- --------------------------------------------------------------------------
-- create_booking: atomic, idempotent (scoped to conversation), one confirmed
-- booking per conversation, live schedule/price/pet revalidation at commit.
-- --------------------------------------------------------------------------
create or replace function create_booking(
  p_conversation_id uuid,
  p_offer_id        uuid,
  p_customer_name   text,
  p_customer_phone  text,
  p_pet_name        text,
  p_pet_species     text default 'dog',
  p_pet_breed       text default null,
  p_pet_weight_kg   numeric default null,
  p_pet_notes       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv        conversations;
  v_studio      studios;
  v_offer       offers;
  v_service     services;
  v_appt        appointments;
  v_existing    appointments;
  v_customer_id uuid;
  v_pet_id      uuid;
  v_band        text;
  v_date_str    text;
  v_weekday     text;
  v_hours       jsonb;
  v_open_at     timestamptz;
  v_close_at    timestamptz;
  v_break_start timestamptz;
  v_break_end   timestamptz;
  v_conflict    boolean;
begin
  -- Lock the conversation row (serializes search + booking + retries).
  select * into v_conv from conversations
  where id = p_conversation_id and status = 'active' and expires_at > now()
  for update;
  if not found then
    raise exception 'invalid_or_expired_conversation';
  end if;

  select * into v_studio from studios where id = v_conv.studio_id;

  -- Scoped idempotency: return the already-committed booking for this
  -- conversation's offer BEFORE rejecting an expired offer, so a retry after
  -- offer expiry still returns the committed result. Scoped by offer_id AND
  -- conversation_id AND studio_id.
  select a.* into v_existing
  from appointments a
  where a.offer_id = p_offer_id
    and a.conversation_id = p_conversation_id
    and a.studio_id = v_conv.studio_id
    and a.status = 'confirmed';
  if found then
    return jsonb_build_object(
      'idempotent',       true,
      'id',               v_existing.id,
      'staffName',        (select name from staff where id = v_existing.staff_id),
      'serviceName',      (select name from services where id = v_existing.service_id),
      'startsAt',         v_existing.starts_at,
      'endsAt',           v_existing.ends_at,
      'quotedPriceCents', v_existing.quoted_price_cents,
      'petName',          (select name from pets where id = v_existing.pet_id),
      'source',           v_existing.source
    );
  end if;

  -- One booking per conversation (partial unique index backs this).
  if exists (
    select 1 from appointments
    where conversation_id = p_conversation_id and status = 'confirmed'
  ) then
    raise exception 'one_booking_per_conversation';
  end if;

  if not v_studio.accept_bookings then
    raise exception 'bookings_disabled';
  end if;

  if v_conv.capability_hash != studio_capability_hash(v_conv.studio_id) then
    raise exception 'capability_hash_mismatch';
  end if;

  -- Load the offer under lock; must be pending, current generation, unexpired.
  select * into v_offer from offers
  where id = p_offer_id
    and conversation_id = p_conversation_id
    and status = 'pending'
    and generation = v_conv.search_generation
    and expires_at > now()
  for update;
  if not found then
    raise exception 'offer_not_found_or_expired';
  end if;

  -- Revalidate the service from live data (never trust snapshot for billing).
  select * into v_service
  from services where id = (v_offer.service_snapshot->>'id') and studio_id = v_conv.studio_id;
  if not found then
    raise exception 'service_not_found';
  end if;
  if v_service.starting_price_cents != (v_offer.service_snapshot->>'startingPriceCents')::int then
    raise exception 'price_changed';
  end if;
  if v_service.duration_minutes != (v_offer.service_snapshot->>'durationMinutes')::int
     or v_service.buffer_minutes != (v_offer.service_snapshot->>'bufferMinutes')::int then
    raise exception 'service_schedule_changed';
  end if;

  -- Staff still eligible for this service.
  if not exists (
    select 1 from staff where id = v_offer.staff_id and studio_id = v_conv.studio_id and service_ids ? v_service.id
  ) then
    raise exception 'staff_not_eligible';
  end if;

  -- Pet species/weight/size-band revalidation at commit.
  if p_pet_species is null or p_pet_species <> 'dog' then
    raise exception 'unsupported_species';
  end if;
  v_band := resolve_size_band(p_pet_weight_kg);
  if v_band is null then
    raise exception 'weight_handoff';
  end if;
  if v_band <> v_service.size_band then
    raise exception 'size_band_mismatch';
  end if;

  -- Live schedule revalidation: re-run hours/break/block checks at commit so a
  -- block/hours edit between offer (5-min TTL) and commit cannot land a booking
  -- inside a block or outside hours.
  v_date_str := to_char(v_offer.starts_at at time zone v_studio.timezone, 'YYYY-MM-DD');
  v_weekday  := lower(to_char(v_offer.starts_at at time zone v_studio.timezone, 'FMDay'));

  select elem into v_hours
  from jsonb_array_elements(v_studio.weekly_hours) as elem
  where elem->>'weekday' = v_weekday;
  if v_hours is null or coalesce((v_hours->>'closed')::boolean, false) then
    raise exception 'closed_day';
  end if;

  v_open_at  := (v_date_str || 'T' || (v_hours->>'open')  || ':00')::timestamp at time zone v_studio.timezone;
  v_close_at := (v_date_str || 'T' || (v_hours->>'close') || ':00')::timestamp at time zone v_studio.timezone;
  if v_offer.starts_at < v_open_at or v_offer.occupied_until > v_close_at then
    raise exception 'outside_hours';
  end if;

  -- Future start.
  if v_offer.starts_at <= now() then
    raise exception 'start_not_in_future';
  end if;

  v_conflict := false;
  if exists (
    select 1 from staff where id = v_offer.staff_id and daily_break is not null
  ) then
    select daily_break into v_hours from staff where id = v_offer.staff_id;
    v_break_start := (v_date_str || 'T' || (v_hours->>'start') || ':00')::timestamp at time zone v_studio.timezone;
    v_break_end   := (v_date_str || 'T' || (v_hours->>'end')   || ':00')::timestamp at time zone v_studio.timezone;
    if v_offer.starts_at < v_break_end and v_offer.occupied_until > v_break_start then
      v_conflict := true;
    end if;
  end if;

  if not v_conflict then
    select exists(
      select 1 from schedule_blocks sb
      where sb.staff_id = v_offer.staff_id
        and sb.starts_at < v_offer.occupied_until and sb.ends_at > v_offer.starts_at
    ) into v_conflict;
  end if;

  if v_conflict then
    raise exception 'schedule_conflict';
  end if;

  -- Always create a NEW unverified voice customer (never merge/update an
  -- existing customer by caller-supplied phone).
  insert into customers (studio_id, name, phone, source)
  values (v_conv.studio_id, p_customer_name, p_customer_phone, 'voice')
  returning id into v_customer_id;

  insert into pets (studio_id, customer_id, name, species, breed, weight_kg, notes)
  values (v_conv.studio_id, v_customer_id, p_pet_name, p_pet_species, p_pet_breed, p_pet_weight_kg, p_pet_notes)
  returning id into v_pet_id;

  -- Claim the offer.
  update offers set status = 'accepted' where id = p_offer_id;

  -- Insert appointment (GIST exclusion is the final overlap guard).
  insert into appointments (
    studio_id, conversation_id, offer_id, customer_id, pet_id,
    staff_id, service_id, starts_at, ends_at, occupied_until,
    quoted_price_cents, status, source
  ) values (
    v_conv.studio_id, p_conversation_id, p_offer_id, v_customer_id, v_pet_id,
    v_offer.staff_id, v_service.id, v_offer.starts_at, v_offer.ends_at, v_offer.occupied_until,
    v_service.starting_price_cents, 'confirmed', 'voice'
  ) returning * into v_appt;

  return jsonb_build_object(
    'idempotent',       false,
    'id',               v_appt.id,
    'staffName',        (select name from staff where id = v_appt.staff_id),
    'serviceName',      v_service.name,
    'startsAt',         v_appt.starts_at,
    'endsAt',           v_appt.ends_at,
    'quotedPriceCents', v_appt.quoted_price_cents,
    'petName',          p_pet_name,
    'source',           v_appt.source
  );
end;
$$;

-- --------------------------------------------------------------------------
-- create_handoff: persists a staff task, deduplicated by conversation+reason.
-- --------------------------------------------------------------------------
create or replace function create_handoff(
  p_conversation_id  uuid,
  p_reason           text,
  p_summary          text default null,
  p_callback_contact text default null,
  p_booking_id       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio text;
  v_row    handoffs;
begin
  -- Derive studio from the conversation (never from caller).
  select studio_id into v_studio from conversations where id = p_conversation_id;
  if not found then
    raise exception 'invalid_conversation';
  end if;

  insert into handoffs (
    studio_id, conversation_id, reason, summary, callback_contact, booking_id, status
  ) values (
    v_studio, p_conversation_id, p_reason, p_summary, p_callback_contact, p_booking_id, 'open'
  )
  on conflict (conversation_id, reason) do update
    set summary          = excluded.summary,
        callback_contact = excluded.callback_contact,
        booking_id       = excluded.booking_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'reason', v_row.reason, 'status', v_row.status, 'persisted', true);
end;
$$;

-- --------------------------------------------------------------------------
-- get_session_state: offers + booking + handoff for a conversation.
-- --------------------------------------------------------------------------
create or replace function get_session_state(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offers  jsonb;
  v_booking jsonb;
  v_handoff jsonb;
  v_gen     int;
begin
  select search_generation into v_gen from conversations where id = p_conversation_id;
  if not found then
    raise exception 'invalid_conversation';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',                 o.id,
    'staffName',          s.name,
    'serviceName',        o.service_snapshot->>'name',
    'startsAt',           o.starts_at,
    'startingPriceCents', (o.service_snapshot->>'startingPriceCents')::int
  )), '[]'::jsonb)
  into v_offers
  from offers o
  join staff s on s.id = o.staff_id
  where o.conversation_id = p_conversation_id
    and o.status = 'pending'
    and o.generation = v_gen
    and o.expires_at > now();

  select jsonb_build_object(
    'id',               a.id,
    'staffName',        s.name,
    'serviceName',      svc.name,
    'startsAt',         a.starts_at,
    'endsAt',           a.ends_at,
    'quotedPriceCents', a.quoted_price_cents,
    'petName',          p.name
  )
  into v_booking
  from appointments a
  join staff s on s.id = a.staff_id
  join services svc on svc.id = a.service_id
  join pets p on p.id = a.pet_id
  where a.conversation_id = p_conversation_id and a.status = 'confirmed'
  limit 1;

  select jsonb_build_object('id', h.id, 'status', h.status)
  into v_handoff
  from handoffs h
  where h.conversation_id = p_conversation_id and h.status = 'open'
  limit 1;

  return jsonb_build_object(
    'offers',  coalesce(v_offers, '[]'::jsonb),
    'booking', v_booking,
    'handoff', v_handoff
  );
end;
$$;

-- --------------------------------------------------------------------------
-- expire_old_offers: maintenance only.
-- --------------------------------------------------------------------------
create or replace function expire_old_offers()
returns void
language sql
security definer
set search_path = public
as $$
  update offers set status = 'expired' where status = 'pending' and expires_at <= now();
$$;

-- --------------------------------------------------------------------------
-- Privilege lockdown
-- --------------------------------------------------------------------------

-- Revoke default PUBLIC + anon/authenticated execution on every RPC/helper.
revoke execute on function studio_capability_hash(text) from public, anon, authenticated;
revoke execute on function resolve_size_band(numeric) from public, anon, authenticated;
revoke execute on function create_conversation(text, text, text, int, int) from public, anon, authenticated;
revoke execute on function find_available_slots(uuid, text, text, text, numeric, text) from public, anon, authenticated;
revoke execute on function create_booking(uuid, uuid, text, text, text, text, text, numeric, text) from public, anon, authenticated;
revoke execute on function create_handoff(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function get_session_state(uuid) from public, anon, authenticated;
revoke execute on function expire_old_offers() from public, anon, authenticated;

-- service_role only.
grant execute on function studio_capability_hash(text) to service_role;
grant execute on function resolve_size_band(numeric) to service_role;
grant execute on function create_conversation(text, text, text, int, int) to service_role;
grant execute on function find_available_slots(uuid, text, text, text, numeric, text) to service_role;
grant execute on function create_booking(uuid, uuid, text, text, text, text, text, numeric, text) to service_role;
grant execute on function create_handoff(uuid, text, text, text, uuid) to service_role;
grant execute on function get_session_state(uuid) to service_role;
grant execute on function expire_old_offers() to service_role;

-- No direct table writes for anon/authenticated.
revoke insert, update, delete on studios, studio_members, staff, services, schedule_blocks from anon, authenticated;
revoke insert, update, delete on customers, pets, conversations, offers, appointments, handoffs, tool_calls from anon, authenticated;
