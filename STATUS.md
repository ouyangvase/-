# PROJECT 12 status

Date: 2026-08-21

## Goal branch audit: `goal/telegram-internal-chat-game`

This branch supersedes the earlier mechanism-oriented direction. The authoritative target is now a Telegram Main Mini App whose product, wallet and realtime game all live inside the Mini App; Telegram Bot is limited to entry and private notifications, and the internal chat is not a Telegram native group.

Safety state at start of this goal:

- Backup branch created: `backup/pre-chat-game-goal` at the last verified commit.
- Working branch created: `goal/telegram-internal-chat-game`.
- Existing public staging URL preserved: `https://project-12-demo-staging-public.vercel.app`.
- Working tree was clean before the branch operation.
- No Telegram Bot token, Supabase service credential, or production database URL is present in the local `.env.local`.
- The current app still reports Demo mode when those external services are absent; no real-money path is enabled.

Current implementation gap for this goal:

- The Mini App now has an authenticated internal chat feed with numeric banker/bet commands, `shN`, close-betting, SSE delivery and participant-only packet access; the UI is still a compact reference-derived implementation rather than a pixel copy of the supplied Telegram screenshots.
- Existing round APIs and worker contain demo-safe primitives for bids, bets, packets, claims and settlement; the chat command parser now supports multiple banker bids, highest-bid close permission, explicit packet confirmation and persisted Worker-generated room notices. The production worker loop still needs external database credentials and deployment verification.
- Fifteen selectable locale dictionaries are implemented (`zh-CN`, `zh-TW`, `en`, `ms`, `th`, `vi`, `id`, `ta`, `my`, `km`, `hi`, `ar`, `ja`, `ko`, `fil`), the Mini App stores the preference in local storage plus `user_profiles.locale`, and approval/packet Bot events carry a locale when produced by the API. The five newest locales have concrete core-game copy, Arabic switches the document to RTL, and low-frequency legacy copy still uses the English fallback until native review.
- Supabase/Postgres migrations and adapters now include the locale constraint and `room_messages` Realtime publication preparation, but this workspace is not connected to the supplied Supabase project yet.
- Gate A (real `/start` → Main Mini App → signed `initData` → persisted user → approval notification) cannot be proven until the owner supplies/configures the Bot token and database credentials.

## Delivered

- The benchmark decks and supplied screenshots remain classified as source/benchmark evidence; they do not override the implementation request. The design system is persisted under `design-system/project-12/`.
- The Mini App has onboarding, public routes (`/hall`, `/wallet`, `/chat`, `/profile`, `/rules`, `/game/:id`, `/missions`, `/referral`), safe-area handling, Telegram bridge, SecureStorage device key pair, referral deep links, rules, hall, round centre, wallet ledger, chat, profile, missions and referral surfaces. In a Telegram runtime, onboarding and all financial-state writes now stop when the API is unavailable or returns an error; only a non-Telegram local browser may use the deterministic Demo fallback.
- The server uses the canonical round states `LOBBY`, `BANKER_BIDDING`, `BETTING`, `WAITING_BANKER_CONFIRM`, `PACKET_SENT`, `CLAIMING`, `EVALUATING`, `SETTLING`, `ROUND_COMPLETE`, `ROUND_CANCELLED`, `REFUNDING`, `REFUNDED`, `DISPUTED`.
- The game engine covers banker bid tie-breaking, packet digit rules, source-confirmed hand examples, claimed-at settlement order, bet-accepted tail packets, WIN/LOSE/TIE/WATERED settlement branches and fee/pool arithmetic.
- Every demo credit write uses an idempotency key and a balanced journal; fee and reward lines preserve two decimal places. Real-money, payment, top-up, withdrawal and cash-reward paths are server-disabled.
- Telegram `/start`, `ref_<code>` deep links, reply keyboard, Menu Button/Main Mini App payloads, commands, notifications and webhook-secret validation are implemented as a safe adapter. Actual delivery remains opt-in and token-gated.
- Auth verifies signed Telegram `initData` outside demo mode, accepts one-time database-backed launch grants for reply-keyboard `/start`, issues an expiring `HttpOnly` cross-origin-safe cookie, and does not persist a session token in browser storage. Security PINs use runtime-compatible scrypt hashes.
- Postgres schema, forward migration, seed, optional API persistence adapter, outbox, long-lived SSE round stream, worker lock, admin risk/recovery/adjustment endpoints and seven-service Compose topology are present. Seed covers 20 demo users, two rooms, 30 historical rounds, four campaigns, three referral levels and eight banners.
- Telegram device onboarding never stores a private key in the non-SecureStorage fallback; it retains only a public compatibility key and tells the user that rebinding may be required.
- The Bot service now remains alive with `/health` and `/telegram/webhook`; it only calls Telegram when a token and webhook configuration are supplied.
- The internal chat game path is implemented in Demo mode: verified users control the round only by sending text in the room. Numeric banker bids, `2–17` bets, `shN`/`sh N` bets, `停止下注`, `确认发红包`, `/重推`, `抢红包`/`claim`, and the `1`/`0` continuation commands are parsed server-side; there are no game-action buttons. `停止下注` moves the round to `WAITING_BANKER_CONFIRM`, and the current banker must explicitly send `确认发红包` before the internal packet is created. Only recorded bettors receive the private packet card and claim eligibility; spectators receive no claim entry point.
- Banker bidding is server-authoritative: each player's latest bid is retained, the highest bid wins with server receipt ordering for ties, only the current highest bidder can close bidding, and the Worker auto-advance writes a public platform notice plus `INTERNAL_CHAT_MESSAGE` outbox event when a deadline closes banker bidding or betting.
- Locale preference is validated server-side, persisted for Telegram users, and used as the payload locale for verification approval notifications.
- The public Vercel deployment exposes the mobile-first Mini App and bundled API at `https://project-12-demo-staging-public.vercel.app`; the latest production deployment is `dpl_5mq5xCscPupyHn4uGsLPmxQRTzBw`, and direct `/api/health` plus `/` checks return 200. The current public runtime is explicitly Demo mode with real-money paths disabled.
- Fresh branch Preview after the banker-flow fix: `https://project-12-demo-staging-public-97e4h71se-tomupros-projects.vercel.app` (`dpl_37zjdKkS7LKQahfQu2wxJse4GHvG`). Anonymous `/` and `/api/health` both return 200; health reports `mode=demo`, `realMoneyDisabled=true`, `bot=blocked`, `database=disabled`.
- Latest deployment after the Demo KYC persistence fix: production `dpl_2B8AyAuMR771TxkAaBJtcCRD3u3U`, aliased to `https://project-12-demo-staging-public.vercel.app`. In stateless Demo mode, the default feature-preview account `demo-player-01` deterministically reports `APPROVED` so a cold Vercel instance does not return the user to the KYC modal; real persisted KYC is unchanged.
- Vercel's webhook directly handles the Bot → Mini App reply path with retry-safe update storage; the long-running Worker claims the outbox, writes heartbeats and advances safe expired round states with Postgres advisory locks. It is optional by default and is enforced only when `REQUIRE_WORKER=true`.
- When `DATABASE_URL` is configured, Telegram sessions are resolved from hashed Postgres sessions after cold starts, player wallet/onboarding state is hydrated from Postgres, and internal packet claims use a row-locked persistent packet record (`006-persistent-internal-packets.sql`) instead of process memory.
- Persisted round transitions now use an expected-state conditional update in Postgres; stale concurrent actions fail with `409 ROUND_STATE_CONFLICT` instead of overwriting the newer round state. `pnpm telegram:verify` checks Bot identity, webhook, Menu Button and commands without printing the Bot token.
- Authenticated production requests use an isolated async runtime for the user snapshot and balance view; wallet ledger rows are rehydrated from the user's persisted `USER_AVAILABLE` journal lines instead of sharing the demo process state.
- Non-Demo API and Bot deployments fail closed when the admin token or Telegram webhook secret is absent; local Demo defaults are not accepted in staging. Bot `/health` returns 503 until `TELEGRAM_BOT_TOKEN` is configured, and production Admin bundles no longer embed the local demo admin token.
- `.env.example` documents the local demo defaults, Telegram boundary variables and production safety switches.

## Implementation boundary

The runnable workspace uses the existing Vite + React + handwritten Node/SQL shell so the Mini App, API, Admin, Worker and Bot can be verified locally without an external platform account. The domain contracts and database model are kept framework-neutral; a production migration to Next.js/Tailwind/Radix/Drizzle/Zod remains a separate delivery decision, not an unverified claim in this demo.

## Verification evidence

### Latest goal-turn verification (2026-08-21)

- `pnpm test`: 10 files, 50 tests passed.
- `pnpm typecheck`: passed.
- `pnpm build`: Mini App, Admin, API, Worker and Bot passed.
- `pnpm vercel:build`: passed; the bundled API emits only the existing non-blocking CJS `import.meta` warnings.
- `pnpm test:e2e`: 13 passed, 5 skipped by the existing duplicate visual-project policy.
- Public read-only smoke on `https://project-12-demo-staging-public.vercel.app`: homepage, health, auth, verification submit/status, hall, announcements, chat rooms, chat messages, wallet, leaderboard, daily rewards and chat read all returned 200.
- Public health summary: `mode=demo`, `realMoneyDisabled=true`; authentication mode is `mock` and the smoke used the deterministic Demo preview account only.
- Latest production deployment: `dpl_21J4Yi6chy9Lsxj7q2MJ411DPCLB`, alias `https://project-12-demo-staging-public.vercel.app`, Vercel state `READY`.

| Check | Result |
|---|---|
| `pnpm test` | 10 files, 49 passed |
| `pnpm build` | Mini App, Admin, API, Worker and Bot passed after locale/chat changes |
| `pnpm typecheck` / `pnpm lint` | passed; lint is intentionally the strict TypeScript gate in this small repo |
| `pnpm test:e2e` | 13 passed: six responsive demo flows, six Telegram-runtime guard flows and one visual baseline; 5 duplicate visual projects skipped |
| API smoke | passed: auth, HttpOnly cookie, idempotent bet replay, claim, two-decimal settlement (`playerCredit=2387.5`, Fee `112.5`), onboarding and `REAL_MONEY_DISABLED` guard |
| Staging auth gate | passed: `APP_MODE=staging`, mock disabled; unsigned initData returns 503 `TELEGRAM_SIGNED_INIT_DATA_REQUIRED`, default admin token returns 403, Bot health without token returns 503, and missing webhook secret returns 503 `WEBHOOK_SECRET_REQUIRED` |
| Load | passed: 100 virtual users × 20 rounds, 2,200 requests, 0 failed, p50 2ms, p95 7ms, 100 replay requests |
| Cancellation/realtime | passed: cancellation reaches `REFUNDED`; one-shot SSE probe contains `ROUND_CANCELLED`, and a live stream received a later `BETTING` transition |
| Docker | `docker compose config` passed; runtime startup is not claimed because the local Docker Linux engine is unavailable |
| Visual QA | 19 named screenshots captured at 390×844, including banker bidding, plus six responsive E2E viewports and a 1440×900 Admin capture |
| React Doctor | design scan: no issues found |
| Runtime smoke | Demo API auth → device → referral → runtime scrypt PIN → bet → claim → settlement passed; public Vercel `/api/health` and `/api/health/live` return 200 after latest production deploy |
| Demo KYC access smoke | Public staging auth returned `APPROVED`, `canUseChat=true`, `canUseWallet=true`; `/api/chat/room` and `/api/wallet` returned 200 after `dpl_2B8AyAuMR771TxkAaBJtcCRD3u3U` |

## External blocker: Telegram-connected staging

The public Mini App/API is reachable, but the complete Telegram-in-app path cannot be truthfully claimed yet. The deployment owner still needs to authorize the Bot token/webhook secret and a managed Supabase/Postgres connection; the current health response reports `bot: blocked`, `database: disabled`, and `mode: demo`. The supplied Supabase dashboard link is not an API credential and was not written to. The target `@onetwogaming_bot` is an external bot; it cannot be rewired to this project without the owner's BotFather token. The current workspace branch is `goal/telegram-internal-chat-game`; the locale/chat and banker-flow changes are committed as `d033b3e`, pushed, and deployed to the fresh Preview above. This does not change the preserved public staging alias.

Until that bundle exists, keep `REAL_MONEY_ENABLED=false`, `TOP_UP_ENABLED=false`, `WITHDRAWAL_ENABLED=false`, `CASH_REWARD_ENABLED=false`, `PACKET_PROVIDER=demo` and `TELEGRAM_MOCK_ENABLED=true`.
