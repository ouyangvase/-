# PROJECT 12 · Telegram 12牛牛 Demo

Telegram Social Game Demo using simulation credits only. No deposit, withdrawal, cash-out, TNG integration, or cash rewards are implemented.

## Current runtime

- Node.js: `v22.13.1` (local runtime)
- pnpm: `11.19.0`
- TypeScript, React, Vite, Vitest, Playwright
- PostgreSQL and Redis are defined for local infrastructure; the browser demo remains runnable without them.

## Start locally

```bash
pnpm install
pnpm dev
```

- Mini App: http://localhost:4173
- Admin: http://localhost:4174
- API health: http://localhost:8787/health
- Bot service: `pnpm --filter @project12/bot dev` (Demo listens on `http://localhost:8790/health` and `/telegram/webhook`; it never sends without a token)

The UI uses a deterministic local demo fallback when the API is not running. The API exposes the same demo state and server-side game/ledger rules. When `DATABASE_URL` is set, identity, sessions, onboarding security data, idempotency keys, round events, outbox events, audit records and balanced journals are persisted to PostgreSQL; without it, the deterministic memory fallback remains available only for local Demo mode.

## Safety boundary

All credit is labeled `DEMO CREDIT / NO CASH VALUE`. The API rejects real-money operations, and only the `DemoPacketProvider` is enabled. `TngPacketProvider` is an explicit `PROVIDER_NOT_CONFIGURED` error path. Keep `REAL_MONEY_ENABLED=false`, `TOP_UP_ENABLED=false`, `WITHDRAWAL_ENABLED=false`, `CASH_REWARD_ENABLED=false`, `PACKET_PROVIDER=demo` and `TELEGRAM_MOCK_ENABLED=true` for local testing.

## Verification

```bash
pnpm test
pnpm build
pnpm test:e2e
pnpm demo:load
docker compose config
```

Visual QA evidence is recorded in `docs/design/visual-qa.md`; the Mini App E2E suite covers 375×667, 390×844, 430×932, 360×800, 412×915 and 480×900. Admin evidence is captured at 1440×900.

## Telegram connection later

Create a Bot in BotFather only after a real Bot username and token are supplied. Set the Mini App URL, commands, and webhook using the steps in `docs/operations/telegram-setup.md`. Never put the Bot token in client-side environment variables.
