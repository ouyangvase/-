# Staging

## Current public staging

- Mini App and bundled API production alias: `https://project-12-demo-staging-public.vercel.app` (latest verified deployment `dpl_GQFWc8xELj67pBmZrs68Xa84AK89`). Root, `/api/health` and `/api/health/live` return HTTP 200. The public runtime reports `mode: demo`, `packetProvider: DEMO_READY`, `realMoneyDisabled: true`, `bot: blocked` and `database: disabled` until deployment credentials are added.
- Admin production alias: `https://project-12-admin-staging.vercel.app` (latest verified deployment `dpl_9ApdYMWBqmFB1YBeedWsjeeqz7hk`). Root and `/admin/rounds` return HTTP 200; the production bundle does not embed the local demo admin token.
- The public alias serves the mobile-first Mini App and the bundled API Function. The local test harness also covers the Telegram-runtime guard, so a Telegram container cannot silently continue when its API is unavailable.
- Vercel deployment protection may require `vercel curl` or an authorized browser session for deployment URLs; the public aliases returned HTTP 200 in direct verification.
- The Vercel API Function is publicly deployed. The long-running Worker and Supabase/Postgres are not connected yet, and Telegram Bot delivery remains blocked because no BotFather token/webhook secret has been configured.

The remaining external blocker for a complete Telegram staging path is the owner-controlled Bot token/webhook secret and Supabase Postgres connection. Once supplied, apply the schema/migrations, set Vercel environment values, run `pnpm telegram:configure`, deploy the Worker with the same database/token settings, and run the health/checklist gate. Keep real-money flags false.
