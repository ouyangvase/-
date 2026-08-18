# Staging

## Current static staging

- Mini App production alias: `https://project-12-demo-staging-public.vercel.app` (latest verified deployment `dpl_62b33MgSNEqF83heW3oueQYwc4sv`). Root, `/games/12/rules`, `/profile/referral` and an unknown SPA route return HTTP 200; the served bundle includes banker bidding, Telegram MainButton wiring, two-decimal settlement handling and the Telegram-runtime API-write guard.
- Admin production alias: `https://project-12-admin-staging.vercel.app` (latest verified deployment `dpl_7Lnk72hMmFaSpPwyVG1MZwxRGVV8`). Root and `/admin/rounds` return HTTP 200.
- These are static front-end staging surfaces. The Mini App currently falls back to local Demo behavior because no public API origin was supplied; Admin API panels remain local-fallback until an API is reachable.
- Vercel deployment protection may require `vercel curl` or an authorized browser session for deployment URLs; the public aliases returned HTTP 200 in direct verification.
- API, Worker, PostgreSQL, Redis and Telegram Bot delivery are not publicly deployed.

The remaining external blocker for a complete Telegram staging path is one authorized bundle: Bot token/webhook secret, a public API/Worker container host, managed Postgres/Redis credentials and the final API origin to inject into the Mini App build. Once supplied, deploy API/Worker/data, configure the Bot webhook, set the demo-only environment values, and run the health/checklist gate. Keep real-money flags false.
