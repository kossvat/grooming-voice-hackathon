-- Migration 004: synthetic demo seed
-- Fictional studio/people/pets/hours/appointments. NOT a live salon.
-- Apply once to a fresh project; schedule blocks are not fully repeatable.
-- Run AFTER 001-003. service_role / dashboard SQL editor only.

-- ---------------------------------------------------------------------------
-- Studio
-- ---------------------------------------------------------------------------
insert into studios (
  id, name, timezone, demo_mode, policy_version,
  accept_new_sessions, accept_bookings,
  weekly_hours, booking_horizon_days, slot_step_minutes, cleanup_buffer_minutes
) values (
  'studio_demo',
  'Grooming Demo Studio',
  'America/New_York',
  true,
  1,
  true,
  true,
  '[
    {"weekday":"monday","closed":true},
    {"weekday":"tuesday","open":"09:00","close":"18:00"},
    {"weekday":"wednesday","open":"09:00","close":"18:00"},
    {"weekday":"thursday","open":"09:00","close":"18:00"},
    {"weekday":"friday","open":"09:00","close":"18:00"},
    {"weekday":"saturday","open":"09:00","close":"18:00"},
    {"weekday":"sunday","open":"10:00","close":"18:00"}
  ]'::jsonb,
  14,
  15,
  15
)
on conflict (id) do update set
  weekly_hours           = excluded.weekly_hours,
  booking_horizon_days   = excluded.booking_horizon_days,
  slot_step_minutes      = excluded.slot_step_minutes,
  cleanup_buffer_minutes = excluded.cleanup_buffer_minutes;

-- After creating your own staff user in Supabase Auth, replace the placeholder
-- and run this example separately to grant access to /studio:
-- insert into studio_members (user_id, studio_id, role)
-- values ('<YOUR_AUTH_USER_UUID>', 'studio_demo', 'owner')
-- on conflict (user_id, studio_id) do update set role = excluded.role;

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------
insert into services (
  id, studio_id, family, size_band, name,
  starting_price_cents, currency, quote_type, duration_minutes, buffer_minutes, version
) values
  ('bath_s',  'studio_demo', 'bath',       'S', 'Bath & Brush — Small',   6500,  'USD', 'starting_from', 60,  15, 1),
  ('groom_s', 'studio_demo', 'full_groom', 'S', 'Full Groom — Small',     8000,  'USD', 'starting_from', 90,  15, 1),
  ('bath_m',  'studio_demo', 'bath',       'M', 'Bath & Brush — Medium',  8000,  'USD', 'starting_from', 75,  15, 1),
  ('groom_m', 'studio_demo', 'full_groom', 'M', 'Full Groom — Medium',    10000, 'USD', 'starting_from', 120, 15, 1)
on conflict (id) do update set
  name                 = excluded.name,
  starting_price_cents = excluded.starting_price_cents,
  duration_minutes     = excluded.duration_minutes,
  buffer_minutes       = excluded.buffer_minutes,
  size_band            = excluded.size_band;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
insert into staff (id, studio_id, name, service_ids, daily_break) values
  ('anna',  'studio_demo', 'Anna',  '["bath_s","groom_s","bath_m","groom_m"]'::jsonb, '{"start":"13:00","end":"14:00"}'::jsonb),
  ('maria', 'studio_demo', 'Maria', '["bath_s","groom_s","bath_m","groom_m"]'::jsonb, '{"start":"13:00","end":"14:00"}'::jsonb)
on conflict (id) do update set
  name        = excluded.name,
  service_ids = excluded.service_ids,
  daily_break = excluded.daily_break;

-- ---------------------------------------------------------------------------
-- Customers (deterministic UUIDs so pets/appointments can reference them)
-- ---------------------------------------------------------------------------
insert into customers (id, studio_id, name, phone, source) values
  ('10000000-0000-4000-8000-000000000001', 'studio_demo', 'Jamie Example',  '+12025550101', 'seed'),
  ('10000000-0000-4000-8000-000000000002', 'studio_demo', 'Taylor Example', '+12025550102', 'seed'),
  ('10000000-0000-4000-8000-000000000003', 'studio_demo', 'Casey Example',  '+12025550103', 'seed'),
  ('10000000-0000-4000-8000-000000000004', 'studio_demo', 'Jordan Example', '+12025550104', 'seed'),
  ('10000000-0000-4000-8000-000000000005', 'studio_demo', 'Riley Example',  '+12025550105', 'seed'),
  ('10000000-0000-4000-8000-000000000006', 'studio_demo', 'Morgan Example', '+12025550106', 'seed'),
  ('10000000-0000-4000-8000-000000000007', 'studio_demo', 'Alex Example',   '+12025550107', 'seed'),
  ('10000000-0000-4000-8000-000000000008', 'studio_demo', 'Avery Example',  '+12025550108', 'seed')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Pets
-- ---------------------------------------------------------------------------
insert into pets (id, studio_id, customer_id, name, species, breed, weight_kg, notes) values
  ('20000000-0000-4000-8000-000000000001', 'studio_demo', '10000000-0000-4000-8000-000000000001', 'Coco',  'dog', 'Toy Poodle',         6,  'Prefers a gentle introduction to the dryer.'),
  ('20000000-0000-4000-8000-000000000002', 'studio_demo', '10000000-0000-4000-8000-000000000002', 'Milo',  'dog', 'Cocker Spaniel',     13, ''),
  ('20000000-0000-4000-8000-000000000003', 'studio_demo', '10000000-0000-4000-8000-000000000003', 'Luna',  'dog', 'Shih Tzu',           7,  ''),
  ('20000000-0000-4000-8000-000000000004', 'studio_demo', '10000000-0000-4000-8000-000000000004', 'Rocky', 'dog', 'Miniature Schnauzer', 12, ''),
  ('20000000-0000-4000-8000-000000000005', 'studio_demo', '10000000-0000-4000-8000-000000000005', 'Ziggy', 'dog', 'Cocker Spaniel',     14, ''),
  ('20000000-0000-4000-8000-000000000006', 'studio_demo', '10000000-0000-4000-8000-000000000006', 'Bella', 'dog', 'Shih Tzu',           8,  ''),
  ('20000000-0000-4000-8000-000000000007', 'studio_demo', '10000000-0000-4000-8000-000000000007', 'Teddy', 'dog', 'Poodle',             18, ''),
  ('20000000-0000-4000-8000-000000000008', 'studio_demo', '10000000-0000-4000-8000-000000000008', 'Daisy', 'dog', 'Maltese',            5,  '')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Schedule blocks
-- ---------------------------------------------------------------------------
insert into schedule_blocks (studio_id, staff_id, starts_at, ends_at, reason) values
  ('studio_demo', 'anna', '2026-09-20T12:00:00-04:00', '2026-09-20T13:00:00-04:00', 'Synthetic staff block')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Seed appointments (confirmed, source='seed')
-- ---------------------------------------------------------------------------
insert into appointments (
  studio_id, customer_id, pet_id, staff_id, service_id,
  starts_at, ends_at, occupied_until, quoted_price_cents, status, source
) values
  ('studio_demo', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'anna',  'groom_s', '2026-09-20T10:00:00-04:00', '2026-09-20T11:30:00-04:00', '2026-09-20T11:45:00-04:00', 8000,  'confirmed', 'seed'),
  ('studio_demo', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'maria', 'bath_m',  '2026-09-20T11:30:00-04:00', '2026-09-20T12:45:00-04:00', '2026-09-20T13:00:00-04:00', 8000,  'confirmed', 'seed'),
  ('studio_demo', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'anna',  'groom_s', '2026-09-22T09:00:00-04:00', '2026-09-22T10:30:00-04:00', '2026-09-22T10:45:00-04:00', 8000,  'confirmed', 'seed'),
  ('studio_demo', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'maria', 'bath_s',  '2026-09-22T09:00:00-04:00', '2026-09-22T10:00:00-04:00', '2026-09-22T10:15:00-04:00', 6500,  'confirmed', 'seed'),
  ('studio_demo', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'anna',  'bath_m',  '2026-09-22T11:00:00-04:00', '2026-09-22T12:15:00-04:00', '2026-09-22T12:30:00-04:00', 8000,  'confirmed', 'seed'),
  ('studio_demo', '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'maria', 'groom_m', '2026-09-22T14:00:00-04:00', '2026-09-22T16:00:00-04:00', '2026-09-22T16:15:00-04:00', 10000, 'confirmed', 'seed'),
  ('studio_demo', '10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'anna',  'groom_m', '2026-09-22T14:00:00-04:00', '2026-09-22T16:00:00-04:00', '2026-09-22T16:15:00-04:00', 10000, 'confirmed', 'seed'),
  ('studio_demo', '10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'anna',  'bath_s',  '2026-09-22T16:30:00-04:00', '2026-09-22T17:30:00-04:00', '2026-09-22T17:45:00-04:00', 6500,  'confirmed', 'seed'),
  ('studio_demo', '10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000007', 'maria', 'groom_m', '2026-09-22T10:30:00-04:00', '2026-09-22T12:30:00-04:00', '2026-09-22T12:45:00-04:00', 10000, 'confirmed', 'seed'),
  ('studio_demo', '10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000008', 'maria', 'bath_s',  '2026-09-22T16:30:00-04:00', '2026-09-22T17:30:00-04:00', '2026-09-22T17:45:00-04:00', 6500,  'confirmed', 'seed')
on conflict do nothing;
