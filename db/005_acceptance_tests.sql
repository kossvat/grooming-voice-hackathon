-- Migration 005: SQL acceptance tests (hard-failing, self-cleaning).
-- Run 001-004 first, then run this file as service_role (Supabase SQL editor).
-- One BEGIN ... ROLLBACK wraps everything: no residue survives, pass or fail.
--
-- Fixture anchors (frozen by 004), studio_demo / America/New_York:
--   Monday CLOSED; Tue-Sat 09:00-18:00; both groomers break 13:00-14:00.
--   Tue 2026-09-22 is seed-FULL for 90-min groom_m on anna+maria.
--   Wed 2026-09-23 is empty for both -> the free-day fixture.
--   Provider ids/hashes are random per run, so re-runs never collide.
--
-- Expected failures are caught in nested BEGIN/EXCEPTION and asserted on
-- SQLSTATE + message; anything unexpected is RERAISEd to fail the suite.

begin;

do $test$
declare
  v_studio       text := 'studio_demo';
  v_prov_a       text := 'at_005_' || replace(gen_random_uuid()::text, '-', '');
  v_prov_b       text := 'at_005_' || replace(gen_random_uuid()::text, '-', '');
  v_prov_c       text := 'at_005_' || replace(gen_random_uuid()::text, '-', '');
  v_prov_d       text := 'at_005_' || replace(gen_random_uuid()::text, '-', '');
  v_conv_a       uuid;
  v_conv_b       uuid;
  v_conv_c       uuid;
  v_conv_d       uuid;
  v_missing      uuid := 'ff000000-0000-4000-8000-00000000dead';
  v_res          jsonb;
  v_gen_a        int;
  v_slots_a      jsonb;
  v_slots_b      jsonb;
  v_offer_1      uuid;
  v_offer_2      uuid;
  v_offer_b      uuid;
  v_offer_c      uuid;
  v_id_1         uuid;
  v_day_free     text := '2026-09-23';
  v_day_closed   text := '2026-09-21';
  v_day_full     text := '2026-09-22';
  v_fn_oid       oid;
  v_ok           boolean;
begin
  -- 1. ACL: anon/authenticated denied EXECUTE on every RPC/helper; service_role
  --    granted. Checked with has_function_privilege against each function OID
  --    (a PUBLIC grant would also make anon true, so this covers PUBLIC too).
  for v_fn_oid in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'studio_capability_hash','resolve_size_band','create_conversation',
      'find_available_slots','create_booking','create_handoff',
      'get_session_state','expire_old_offers')
  loop
    if has_function_privilege('anon', v_fn_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn_oid, 'EXECUTE') then
      raise exception 'ACL: anon/authenticated can EXECUTE %', v_fn_oid::regprocedure;
    end if;
    if not has_function_privilege('service_role', v_fn_oid, 'EXECUTE') then
      raise exception 'ACL: service_role LACKS EXECUTE on %', v_fn_oid::regprocedure;
    end if;
  end loop;

  -- 2. Tenant tables must have RLS enabled.
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('customers','pets','conversations','appointments','offers','handoffs')
      and c.relrowsecurity = false) then
    raise exception 'RLS: a tenant table has row level security disabled';
  end if;

  -- 3. Sessions (provider id prebound at creation).
  v_conv_a := (create_conversation(v_studio, v_prov_a, md5(v_prov_a))->>'id')::uuid;
  v_conv_b := (create_conversation(v_studio, v_prov_b, md5(v_prov_b))->>'id')::uuid;
  v_conv_c := (create_conversation(v_studio, v_prov_c, md5(v_prov_c))->>'id')::uuid;
  v_conv_d := (create_conversation(v_studio, v_prov_d, md5(v_prov_d))->>'id')::uuid;

  -- 4. Closed day (Monday): zero slots, reason closed_day.
  v_res := find_available_slots(v_conv_a, 'groom_m', v_day_closed);
  if jsonb_array_length(v_res->'slots') <> 0 or v_res->>'reason' is distinct from 'closed_day' then
    raise exception 'CLOSED: expected closed_day/0 slots, got %', v_res;
  end if;

  -- 5. Fully booked day: zero slots.
  v_res := find_available_slots(v_conv_a, 'groom_m', v_day_full, null, 12);
  if jsonb_array_length(v_res->'slots') <> 0 then
    raise exception 'FULL: expected 0 slots, got %', v_res->'slots';
  end if;

  -- 6. Two offers from one search, then a second search bumps generation and
  --    supersedes the first batch.
  v_res := find_available_slots(v_conv_a, 'groom_m', v_day_free, null, 12);
  v_slots_a := v_res->'slots';
  v_gen_a := (v_res->>'generation')::int;
  if jsonb_array_length(v_slots_a) < 2 then
    raise exception 'SEARCH: expected >=2 offers, got %', jsonb_array_length(v_slots_a);
  end if;
  v_offer_1 := (v_slots_a->0->>'offerId')::uuid;

  v_res := find_available_slots(v_conv_a, 'groom_m', v_day_free, null, 12);
  if (v_res->>'generation')::int <= v_gen_a then
    raise exception 'GEN: search did not bump generation (% -> %)', v_gen_a, v_res->>'generation';
  end if;
  if exists (select 1 from offers where id = v_offer_1 and status <> 'superseded') then
    raise exception 'GEN: stale-generation offer still pending';
  end if;
  v_slots_a := v_res->'slots';
  v_offer_1 := (v_slots_a->0->>'offerId')::uuid;
  v_offer_2 := (v_slots_a->1->>'offerId')::uuid;

  -- 7. Idempotency survives offer expiry: commit, expire the offer, retry the
  --    SAME offer id + conversation -> the committed booking comes back.
  v_res := create_booking(v_conv_a, v_offer_1, 'Test Patron', '+15555550100', 'Test Dog', 'dog', 'Mixed', 12);
  if (v_res->>'idempotent')::boolean then
    raise exception 'IDEM: first booking reported idempotent';
  end if;
  v_id_1 := (v_res->>'id')::uuid;

  update offers set expires_at = now() - interval '1 minute' where id = v_offer_1;

  v_res := create_booking(v_conv_a, v_offer_1, 'Test Patron', '+15555550100', 'Test Dog', 'dog', 'Mixed', 12);
  if not (v_res->>'idempotent')::boolean or (v_res->>'id')::uuid <> v_id_1 then
    raise exception 'IDEM: retry after expiry did not return the committed booking';
  end if;

  -- 8. One booking per conversation: a second valid offer on conv A is rejected
  --    with exactly one_booking_per_conversation.
  v_ok := false;
  begin
    v_res := create_booking(v_conv_a, v_offer_2, 'Test Patron', '+15555550100', 'Test Dog', 'dog', 'Mixed', 12);
  exception when others then
    if sqlstate = 'P0001' and sqlerrm = 'one_booking_per_conversation' then
      v_ok := true;
    else
      raise;
    end if;
  end;
  if not v_ok then
    raise exception 'ONEBOOK: a second booking on the same conversation succeeded';
  end if;

  -- 9. Foreign conversation: conv B cannot consume conv A's offer.
  v_res := find_available_slots(v_conv_b, 'groom_m', v_day_free, null, 12);
  v_slots_b := v_res->'slots';
  if jsonb_array_length(v_slots_b) < 1 then
    raise exception 'FOREIGN: conv B found no slots on the free day';
  end if;
  v_offer_b := (v_slots_b->0->>'offerId')::uuid;
  v_ok := false;
  begin
    v_res := create_booking(v_conv_b, v_offer_1, 'Intruder', '+15555550199', 'Intruder Dog', 'dog', 'Mixed', 12);
  exception when others then
    if sqlstate = 'P0001' and sqlerrm = 'offer_not_found_or_expired' then
      v_ok := true;
    else
      raise;
    end if;
  end;
  if not v_ok then
    raise exception 'FOREIGN: booking with another conversation''s offer succeeded';
  end if;

  -- 10. Same staff + same time, two conversations: both may HOLD an offer for
  --     the identical window; the first commit wins and the second must fail the
  --     GIST exclusion (SQLSTATE 23P01). Conv C searches before B commits.
  v_res := find_available_slots(v_conv_c, 'groom_m', v_day_free, null, 12);
  select (sb->>'offerId')::uuid, (sc->>'offerId')::uuid
  into v_offer_b, v_offer_c
  from jsonb_array_elements(v_slots_b) sb
  join jsonb_array_elements(v_res->'slots') sc
    on sc->>'staffId' = sb->>'staffId' and sc->>'startsAt' = sb->>'startsAt'
  limit 1;
  if v_offer_b is null then
    raise exception 'OVERLAP: conv B and C share no identical staff+time window';
  end if;

  v_res := create_booking(v_conv_b, v_offer_b, 'Guest Patron', '+15555550101', 'Guest Dog', 'dog', 'Mixed', 12);
  if (v_res->>'id') is null then
    raise exception 'OVERLAP: conv B failed to commit the shared window';
  end if;

  v_ok := false;
  begin
    v_res := create_booking(v_conv_c, v_offer_c, 'Later Patron', '+15555550102', 'Later Dog', 'dog', 'Mixed', 12);
  exception when others then
    if sqlstate = '23P01' then
      v_ok := true;
    else
      raise;
    end if;
  end;
  if not v_ok then
    raise exception 'OVERLAP: the second booking on an overlapping window succeeded';
  end if;

  -- 11. Handoff dedup: same conversation + reason upserts one row.
  v_res := create_handoff(v_conv_d, 'weight_handoff', 'First summary', '+15555550103');
  if not (v_res->>'persisted')::boolean then
    raise exception 'HANDOFF: first persist did not report persisted=true';
  end if;
  v_id_1 := (v_res->>'id')::uuid;

  v_res := create_handoff(v_conv_d, 'weight_handoff', 'Updated summary', '+15555550103');
  if not (v_res->>'persisted')::boolean or (v_res->>'id')::uuid <> v_id_1 then
    raise exception 'HANDOFF: dedup created a second row instead of upserting';
  end if;
  if (select count(*) from handoffs where conversation_id = v_conv_d and reason = 'weight_handoff') <> 1 then
    raise exception 'HANDOFF: expected exactly 1 row for the conversation';
  end if;

  -- 12. Tenant/scope guard: an unknown conversation id is rejected.
  v_ok := false;
  begin
    v_res := get_session_state(v_missing);
  exception when others then
    if sqlstate = 'P0001' and sqlerrm = 'invalid_conversation' then
      v_ok := true;
    else
      raise;
    end if;
  end;
  if not v_ok then
    raise exception 'SCOPE: get_session_state accepted an unknown conversation';
  end if;

  raise notice '005_acceptance: all 12 checks passed (rollback follows; no residue)';
end
$test$;

-- Every fixture row above is destroyed here, on pass and on fail alike.
rollback;
