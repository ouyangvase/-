# Staging

## Current public staging

- Latest implementation Preview: Mini App/API `https://project-12-demo-staging-public-m028zpid3-tomupros-projects.vercel.app` (`dpl_2kF67sTaQCwmUoi9vSkuSD5kSP9D`) returned READY, then was promoted after endpoint verification.

- Mini App and bundled API production alias: `https://project-12-demo-staging-public.vercel.app` (latest verified deployment `dpl_AiBANCPGRohHtc1WVNnQ6CgsGxhx`). Root, `/api/health` and `/api/version` return HTTP 200. The public runtime reports `mode: demo`, `packetProvider: DEMO_READY`, `realMoneyDisabled: true`, `bot: blocked`, `worker: mock` and `database: disabled` until deployment credentials are added. The deployed Mini App now exposes build/version metadata, checks for a newer build on focus/activation, and asks the user to update only when no round is active.
- Admin production alias: `https://project-12-admin-staging.vercel.app` (latest verified deployment `dpl_9ApdYMWBqmFB1YBeedWsjeeqz7hk`). Root and `/admin/rounds` return HTTP 200; the production bundle does not embed the local demo admin token.
- The public alias serves the mobile-first Mini App and the bundled API Function. The local test harness also covers the Telegram-runtime guard, so a Telegram container cannot silently continue when its API is unavailable.
- Vercel deployment protection may require `vercel curl` or an authorized browser session for deployment URLs; the public aliases returned HTTP 200 in direct verification.
- The Vercel API Function is publicly deployed. Vercel handles Telegram webhook replies and retry-safe `/start` delivery directly; the long-running Worker is a separate Node process (`@project12/worker`) that shares `DATABASE_URL`, claims the outbox, writes heartbeats and advances safe expired round states. It is optional while `REQUIRE_WORKER=false` and becomes a readiness requirement when enabled. Supabase/Postgres and Telegram Bot delivery remain blocked until their credentials are configured.

The remaining external blockers for a complete Telegram staging path are the owner-controlled Bot token/webhook secret, Supabase Postgres connection and a separately hosted Worker. A Telegram native game-group ID is intentionally not required by the new architecture. Once supplied, apply the schema/migrations, set Vercel environment values, run `pnpm telegram:configure`, run `pnpm telegram:verify`, deploy the Worker with the same database/token settings, and run the health/checklist gate. Keep real-money flags false.

The production-domain deployment evidence is recorded in `docs/evidence/vercel-production-domain.json`. It deliberately leaves Telegram screenshots and signed-initData evidence empty because no real BotFather session or Telegram-authenticated user was available in the development environment.
