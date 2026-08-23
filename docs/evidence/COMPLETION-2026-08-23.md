# Project 12 completion evidence · 2026-08-23

## Scope

This completion pass targets the staging/demo build of the Telegram Mini App:

- internal chat is the authoritative game surface;
- chat messages use a monotonic per-room sequence cursor;
- history, realtime, SSE and polling use the same deduplication key;
- the worker state machine and internal packet settlement remain points-only in demo mode;
- leaderboard, daily rewards, live-room inspection, jobs/outbox and rule-version views are exposed through APIs and the operations console;
- production money movement, Telegram bot delivery and external database execution remain disabled.

## Verification evidence

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed: miniapp, admin, API, bot and worker |
| `pnpm test -- --runInBand` | Passed: 10 files, 52 tests |
| `pnpm test:e2e` | Passed: 13 mobile tests; 5 visual captures skipped by the existing spec matrix |
| `pnpm build` | Passed: all workspace builds |
| Chat sequence regression | Passed: ordered `messageSeq`, `latestCursor`, empty `after` replay |
| Mini App/API Preview | Ready: `dpl_48MXEbuFm3qyyByURjUN25gs81E7` |
| Admin Preview | Ready: `dpl_BdRT3ZQowDoHWapjJLeSpKRx3dmd` |
| Preview page | Returned PROJECT 12 HTML |
| Preview health | `ok: true`, API healthy, ledger balanced, real money disabled |
| Staging preflight | Not runnable in the current shell: required deployment variables were not present |

## Implemented in this pass

### Chat reliability

- Added `room_messages.message_seq` and a per-room assignment trigger in `016-chat-message-sequence.sql`.
- Added the same column and trigger to the fresh schema.
- Persisted chat messages return their authoritative sequence and creation time.
- Added `before` and `after` sequence cursors to the room history endpoint.
- Realtime, SSE, polling fallback, older-history loading and send refresh all merge by sequence/id.
- Read receipts persist the last read sequence when the database is enabled.

### Game and rewards surfaces

- Added room leaderboard endpoints for points, card/special results and banker counts.
- Added daily reward snapshot and idempotent demo claim endpoint.
- The mini app reward screen now calls the claim endpoint and refreshes its server state.
- Worker-generated internal notices carry the authoritative message sequence into the outbox payload.

### Operations console

- Dashboard now reads the live overview endpoint.
- Rounds now reads the live-room inspector endpoint.
- Ledger and Audit logs read their API sources.
- Added Jobs/Outbox and immutable Rules pages backed by `/api/admin/jobs` and `/api/admin/rules`.

## Current hard boundary

The deployed Preview reports:

```json
{
  "mode": "demo",
  "realMoneyDisabled": true,
  "worker": "mock",
  "bot": "blocked",
  "internalChat": "demo-only",
  "database": "disabled"
}
```

That means the code path, migrations, state machine and idempotency tests are present, but a real external Postgres/Realtime/Worker deployment has not been claimed. To cross that boundary, the next authorized release step is to provide the deployment environment values, run the migration against the staging database, start the durable worker, and repeat the restart/recovery test against that external runtime. No production alias or production data was changed by this pass.
