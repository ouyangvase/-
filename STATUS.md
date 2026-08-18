# PROJECT 12 status

Date: 2026-08-19

## Delivered

- The benchmark decks and supplied screenshots remain classified as source/benchmark evidence; they do not override the implementation request. The design system is persisted under `design-system/project-12/`.
- The Mini App has onboarding, public routes (`/hall`, `/wallet`, `/chat`, `/profile`, `/rules`, `/game/:id`, `/missions`, `/referral`), safe-area handling, Telegram bridge, SecureStorage device key pair, referral deep links, rules, hall, round centre, wallet ledger, chat, profile, missions and referral surfaces.
- The server uses the canonical round states `LOBBY`, `BANKER_BIDDING`, `BETTING`, `PACKET_SENT`, `CLAIMING`, `EVALUATING`, `SETTLING`, `ROUND_COMPLETE`, `ROUND_CANCELLED`, `REFUNDING`, `REFUNDED`, `DISPUTED`.
- The game engine covers banker bid tie-breaking, packet digit rules, source-confirmed hand examples, claimed-at settlement order, bet-accepted tail packets, WIN/LOSE/TIE/WATERED settlement branches and fee/pool arithmetic.
- Every demo credit write uses an idempotency key and a balanced journal. Real-money, payment, top-up, withdrawal and cash-reward paths are server-disabled.
- Telegram `/start`, `ref_<code>` deep links, reply keyboard, Menu Button/Main Mini App payloads, commands, notifications and webhook-secret validation are implemented as a safe adapter. Actual delivery remains opt-in and token-gated.
- Auth verifies signed Telegram `initData` outside demo mode, issues an expiring `HttpOnly` cookie, and does not persist a session token in browser storage.
- Postgres schema, forward migration, seed, outbox, SSE round snapshot, worker lock, admin risk/recovery/adjustment endpoints and seven-service Compose topology are present. Seed covers 20 demo users, two rooms, 30 historical rounds, four campaigns, three referral levels and eight banners.

## Verification evidence

| Check | Result |
|---|---|
| `pnpm test` | 4 files, 28 passed |
| `pnpm build` | Mini App, Admin, API, Worker and Bot passed |
| `pnpm typecheck` / `pnpm lint` | passed; lint is intentionally the strict TypeScript gate in this small repo |
| `pnpm test:e2e` | 6 responsive flow projects passed; visual baseline project passed; 5 duplicate visual projects skipped |
| API smoke | passed: auth, HttpOnly cookie, idempotent bet replay, claim, settlement, onboarding and `REAL_MONEY_DISABLED` guard |
| Staging auth gate | passed: `APP_MODE=staging`, mock disabled and unsigned initData return 503 `TELEGRAM_SIGNED_INIT_DATA_REQUIRED` |
| Load | passed: 100 virtual users × 20 rounds, 2,200 requests, 0 failed, p50 2ms, p95 7ms, 100 replay requests |
| Cancellation/realtime | passed: cancellation reaches `REFUNDED`; SSE contains `ROUND_CANCELLED` |
| Docker | `docker compose config` passed; runtime startup is not claimed because the local Docker Linux engine is unavailable |
| Visual QA | 18 named screenshots captured at 390×844 plus six responsive E2E viewports and a 1440×900 Admin capture |
| React Doctor | design scan: no issues found |

## One external blocker

Public Telegram staging cannot be truthfully claimed until the deployment owner supplies one authorized staging bundle: Bot token/webhook secret, HTTPS Mini App origin, hosting authorization and managed Postgres/Redis credentials. No such external authority was supplied, and no real Telegram message was sent.

Until that bundle exists, keep `REAL_MONEY_ENABLED=false`, `TOP_UP_ENABLED=false`, `WITHDRAWAL_ENABLED=false`, `CASH_REWARD_ENABLED=false`, `PACKET_PROVIDER=demo` and `TELEGRAM_MOCK_ENABLED=true`.
