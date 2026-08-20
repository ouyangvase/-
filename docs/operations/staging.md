# Staging

## Current public staging

- Mini App and bundled API production alias: `https://project-12-demo-staging-public.vercel.app` (latest verified deployment `dpl_Bya1QMxNeupzobtY9SBBpdL97qXw`). Root, `/api/health`, `/api/health/live` and `/api/health/ready` return HTTP 200. The public runtime reports `mode: demo`, `packetProvider: DEMO_READY`, `realMoneyDisabled: true`, `bot: blocked` and `database: disabled` until deployment credentials are added.
- Admin production alias: `https://project-12-admin-staging.vercel.app` (latest verified deployment `dpl_9ApdYMWBqmFB1YBeedWsjeeqz7hk`). Root and `/admin/rounds` return HTTP 200; the production bundle does not embed the local demo admin token.
- The public alias serves the mobile-first Mini App and the bundled API Function. The local test harness also covers the Telegram-runtime guard, so a Telegram container cannot silently continue when its API is unavailable.
- Vercel deployment protection may require `vercel curl` or an authorized browser session for deployment URLs; the public aliases returned HTTP 200 in direct verification.
- The Vercel API Function is publicly deployed. Vercel handles Telegram webhook replies and retry-safe `/start` delivery directly; the long-running Worker is a separate Node process (`@project12/worker`) that shares `DATABASE_URL`, claims the outbox, writes heartbeats and advances safe expired round states. It is optional while `REQUIRE_WORKER=false` and becomes a readiness requirement when enabled. Supabase/Postgres and Telegram Bot delivery remain blocked until their credentials are configured.

The remaining external blocker for a complete Telegram staging path is the owner-controlled Bot token/webhook secret and Supabase Postgres connection. Once supplied, apply the schema/migrations, set Vercel environment values, run `pnpm telegram:configure`, run `pnpm telegram:verify`, and run the health/checklist gate. Deploy the Worker with the same database/token settings only if background outbox notifications are required; keep real-money flags false.
