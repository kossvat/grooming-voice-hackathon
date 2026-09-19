# Grooming Voice

A hackathon prototype for one fictional grooming studio. An ElevenLabs voice receptionist quotes eligible services, retrieves actual appointment offers, commits a confirmed booking in Supabase and exposes appointments to an authenticated studio CRM. Browser voice is the intended demo transport; Twilio and telephone numbers are not configured.

## Demo and current status

- [Preview voice demo](https://grooming-voice-hackathon-411t8xaov-kossvats-projects.vercel.app/demo)
- [Preview studio CRM](https://grooming-voice-hackathon-411t8xaov-kossvats-projects.vercel.app/studio)

The preview is deployed and the four ElevenLabs tools are configured. Local and remote HTTP booking paths, retry idempotency and authenticated CRM responses passed. On September 19, 2026 at 17:38 ET, Codex independently validated 63 passing tests, TypeScript checks and the production build. The rollback-only SQL suite passed 12 sequential checks.

End-to-end microphone conversation, provider-origin tool calls, audible typing/interruption behavior and browser CRM sign-in/reload have not yet been fully validated. Vercel protection may require the owner to sign in. This is a synthetic demo, not a production salon deployment or BarkReply integration.

## Setup

Use Node.js 20.9 or newer.

```sh
npm ci
cp .env.example .env.local
```

Fill the blank values in `.env.local` with your own Supabase and ElevenLabs configuration. Use separate random values for `SESSION_CAPABILITY_SECRET`, `WEBHOOK_TOOL_SECRET` and `DEMO_CODE`. Set `STUDIO_ID=studio_demo` for the synthetic seed. Server credentials must remain private; only the `NEXT_PUBLIC_` Supabase settings belong in browser code.

1. Create a fresh Supabase project, then apply `db/001_schema.sql` through `db/004_seed.sql` once in numerical order using a trusted SQL connection. See [database setup](db/README.md).
2. Create your staff user in Supabase Auth and copy its user UUID. Replace the placeholder below and run the statement in the SQL editor to grant CRM access:

   ```sql
   insert into studio_members (user_id, studio_id, role)
   values ('<YOUR_AUTH_USER_UUID>', 'studio_demo', 'owner')
   on conflict (user_id, studio_id) do update set role = excluded.role;
   ```

3. Configure your ElevenLabs agent and the corresponding server tool endpoints using the same tool secret. The server routes and session setup are under `app/api/`.
4. Build and run:

   ```sh
   npm run build
   npm run start -- -p 3000
   ```

Open `http://localhost:3000/demo` for voice and `http://localhost:3000/studio` for staff login. Do not run `next build` and `next dev` against the same `.next` directory simultaneously.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

`db/005_acceptance_tests.sql` is a rollback-only acceptance script, not a migration. It uses fixed September 2026 fixtures; it is not a general-purpose future-date test or a parallel concurrency test. Seed data is fictional and uses reserved example phone numbers.

## Development provenance

The initial application was implemented using Mel. At the owner's request, Codex made the final WebRTC compatibility fix, disabling the single-peer-connection option in the browser voice session. Codex also coordinated validation, database setup and this source export. This repository does not claim that all development was performed exclusively in Mel.
