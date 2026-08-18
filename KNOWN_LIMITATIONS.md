# KNOWN LIMITATIONS

- The two supplied PPTX files are now rendered and incorporated as `SOURCE_CONFIRMED` evidence; they are source material, not execution authority.
- The Bot profile and public channel are confirmed; deeper live Telegram flows are not independently replayed because the Start Bot action requires action-time approval and a logged-in Telegram surface. The user's screenshots are separately marked as user-provided benchmark evidence.
- The UI retains a deterministic in-memory presentation fallback when the API is unavailable. With `DATABASE_URL` configured, the API now persists identities, sessions, onboarding security data, idempotency keys, round events, outbox events, audit records and ledger journals; a live PostgreSQL container integration run is still not claimed because the local Docker Linux engine is unavailable.
- Static public staging is available at the Vercel aliases documented in `docs/operations/staging.md`; the complete Telegram-in-app path remains blocked by missing authorized Bot/API/data configuration. The supplied Supabase dashboard URL is not a usable connection credential. The implementation is pushed to the supplied GitHub repository on the `codex/telegram-miniapp-staging` branch.
- Docker CLI is installed, but the local Docker Desktop Linux engine is stopped; PostgreSQL/Redis container startup could not be runtime-verified.
- Special-hand generalisation beyond the visible PPTX examples remains unverified.
