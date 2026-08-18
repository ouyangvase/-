# PROJECT 12 status

Date: 2026-08-19

## Delivered

- The benchmark decks and supplied screenshots remain classified as source/benchmark evidence; they do not override the implementation request. The design system is persisted under `design-system/project-12/`.
- The Mini App has onboarding, public routes (`/hall`, `/wallet`, `/chat`, `/profile`, `/rules`, `/game/:id`, `/missions`, `/referral`), safe-area handling, Telegram bridge, SecureStorage device key pair, referral deep links, rules, hall, round centre, wallet ledger, chat, profile, missions and referral surfaces. In a Telegram runtime, onboarding and all financial-state writes now stop when the API is unavailable or returns an error; only a non-Telegram local browser may use the deterministic Demo fallback.
- The server uses the canonical round states `LOBBY`, `BANKER_BIDDING`, `BETTING`, `PACKET_SENT`, `CLAIMING`, `EVALUATING`, `SETTLING`, `ROUND_COMPLETE`, `ROUND_CANCELLED`, `REFUNDING`, `REFUNDED`, `DISPUTED`.
- The game engine covers banker bid tie-breaking, packet digit rules, source-confirmed hand examples, claimed-at settlement order, bet-accepted tail packets, WIN/LOSE/TIE/WATERED settlement branches and fee/pool arithmetic.
- Every demo credit write uses an idempotency key and a balanced journal; fee and reward lines preserve two decimal places. Real-money, payment, top-up, withdrawal and cash-reward paths are server-disabled.
- Telegram `/start`, `ref_<code>` deep links, reply keyboard, Menu Button/Main Mini App payloads, commands, notifications and webhook-secret validation are implemented as a safe adapter. Actual delivery remains opt-in and token-gated.
- Auth verifies signed Telegram `initData` outside demo mode, issues an expiring `HttpOnly` cross-origin-safe cookie, and does not persist a session token in browser storage. Security PINs use Argon2id hashes.
- Postgres schema, forward migration, seed, optional API persistence adapter, outbox, long-lived SSE round stream, worker lock, admin risk/recovery/adjustment endpoints and seven-service Compose topology are present. Seed covers 20 demo users, two rooms, 30 historical rounds, four campaigns, three referral levels and eight banners.
- Telegram device onboarding never stores a private key in the non-SecureStorage fallback; it retains only a public compatibility key and tells the user that rebinding may be required.
- The Bot service now remains alive with `/health` and `/telegram/webhook`; it only calls Telegram when a token and webhook configuration are supplied.
- Non-Demo API and Bot deployments fail closed when the admin token or Telegram webhook secret is absent; local Demo defaults are not accepted in staging. Bot `/health` returns 503 until `TELEGRAM_BOT_TOKEN` is configured, and production Admin bundles no longer embed the local demo admin token.
- `.env.example` documents the local demo defaults, Telegram boundary variables and production safety switches.

## Implementation boundary

The runnable workspace uses the existing Vite + React + handwritten Node/SQL shell so the Mini App, API, Admin, Worker and Bot can be verified locally without an external platform account. The domain contracts and database model are kept framework-neutral; a production migration to Next.js/Tailwind/Radix/Drizzle/Zod remains a separate delivery decision, not an unverified claim in this demo.

## Verification evidence

| Check | Result |
|---|---|
| `pnpm test` | 6 files, 35 passed |
| `pnpm build` | Mini App, Admin, API, Worker and Bot passed |
| `pnpm typecheck` / `pnpm lint` | passed; lint is intentionally the strict TypeScript gate in this small repo |
| `pnpm test:e2e` | 13 passed: six responsive demo flows, six Telegram-runtime guard flows and one visual baseline; 5 duplicate visual projects skipped |
| API smoke | passed: auth, HttpOnly cookie, idempotent bet replay, claim, two-decimal settlement (`playerCredit=2387.5`, Fee `112.5`), onboarding and `REAL_MONEY_DISABLED` guard |
| Staging auth gate | passed: `APP_MODE=staging`, mock disabled; unsigned initData returns 503 `TELEGRAM_SIGNED_INIT_DATA_REQUIRED`, default admin token returns 403, Bot health without token returns 503, and missing webhook secret returns 503 `WEBHOOK_SECRET_REQUIRED` |
| Load | passed: 100 virtual users × 20 rounds, 2,200 requests, 0 failed, p50 2ms, p95 7ms, 100 replay requests |
| Cancellation/realtime | passed: cancellation reaches `REFUNDED`; one-shot SSE probe contains `ROUND_CANCELLED`, and a live stream received a later `BETTING` transition |
| Docker | `docker compose config` passed; runtime startup is not claimed because the local Docker Linux engine is unavailable |
| Visual QA | 19 named screenshots captured at 390×844, including banker bidding, plus six responsive E2E viewports and a 1440×900 Admin capture |
| React Doctor | design scan: no issues found |
| Runtime smoke | Demo API auth → device → referral → Argon2id PIN → bet → claim → settlement passed; staging without DB returns degraded 503 health |

## External blocker: Telegram-connected staging

Static Vercel staging is reachable, but the complete Telegram-in-app path cannot be truthfully claimed yet. The deployment owner still needs to authorize the Bot token/webhook secret, public API/Worker host, managed Postgres/Redis connection and final API origin injection. The supplied Supabase dashboard link is not an API credential and was not written to. The implementation is committed and pushed to `codex/telegram-miniapp-staging` in the supplied GitHub repository.

Until that bundle exists, keep `REAL_MONEY_ENABLED=false`, `TOP_UP_ENABLED=false`, `WITHDRAWAL_ENABLED=false`, `CASH_REWARD_ENABLED=false`, `PACKET_PROVIDER=demo` and `TELEGRAM_MOCK_ENABLED=true`.
