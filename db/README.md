# Database migrations — Grooming Voice MVP

Use a fresh Supabase project. Apply these files once, in order, with a trusted SQL connection:

1. `001_schema.sql` — tables, indexes, cleanup-inclusive exclusion, cross-tenant triggers.
2. `002_functions.sql` — SECURITY DEFINER RPCs (service_role only) and privilege lockdown.
3. `003_rls.sql` — authenticated members read their own studio; no anonymous writes.
4. `004_seed.sql` — fictional demo studio, services, staff, customers, pets and appointments.

The seed contains fixed September 2026 dates and is not fully repeatable: schedule blocks may duplicate on repeated execution. It does not provision an Auth account or grant an existing account access.

After applying the seed, create your staff user in Supabase Auth. Replace `<YOUR_AUTH_USER_UUID>` in the commented membership example in `004_seed.sql` and run that statement separately. The user must already exist in `auth.users` before membership can be inserted. See the root README for the same example.

`005_acceptance_tests.sql` is a separate rollback-only acceptance script over the RPCs. Do not apply it as a migration. Its twelve checks are sequential, use fixed September 2026 fixtures, and do not establish parallel concurrency behavior.

## Security boundaries

- All privileged RPCs revoked from PUBLIC/anon/authenticated, granted to
  `service_role` only. The trusted Next.js routes verify the static tool secret
  and per-session capability, then call the RPCs with the service_role key.
- Tenant is always derived from the conversation row (locked `FOR UPDATE`);
  never from a caller-supplied `studio_id`.
- One confirmed booking per conversation (partial unique index) + conversation
  row lock; generation bump and offer supersession happen under the same lock.
- Idempotent retry scoped to `offer_id + conversation_id + studio_id`, and
  checked BEFORE an expired offer is rejected.
- `create_booking` revalidates live price/duration/buffer, staff eligibility,
  hours/lunch/blocks, future start, and pet species/weight/size-band at commit.
- No customer lookup/merge by caller-supplied phone; every voice booking creates
  a new unverified customer.
- Session capability stored as an HMAC with its own ≤30-min expiry, separate
  from the policy/version `capability_hash`.
