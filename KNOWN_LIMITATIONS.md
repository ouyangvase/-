# Known limitations

## New-goal blockers (2026-08-21)

- The latest Vercel deployment is publicly reachable and the read-only API smoke passed, but it remains a Demo deployment: health reports `mode=demo`, authentication uses the mock branch, the database is disabled, and real-money operations remain disabled.
- Real Telegram Gate A is blocked by missing owner-supplied Bot token and BotFather configuration; the existing external `@onetwogaming_bot` cannot be used or rewired.
- Supabase project reference `xytaavjiszdjumbaqapx` is known, but a dashboard URL is not a server credential. No service key or database connection string has been written into this workspace.
- The current branch is still a safe Demo runtime. It must not be described as a production wallet, payment or cash-redemption system.
- The screenshot-derived internal chat flow is implemented in Demo mode, including multiple banker bids, highest-bid close permission, banker/bet commands, `shN`, close-betting, explicit banker packet confirmation, participant-only packet access, authenticated SSE and persisted Worker room notices. It still needs production integration testing after Supabase and Telegram credentials are configured.
- The player-facing game interface is intentionally text-only inside the chat room: players type bids, bets, close/confirm commands, and packet claims. The Send control is only the chat composer submit action; there are no game-action or packet-click buttons.
- Fifteen selectable locale dictionaries are implemented (`zh-CN`, `zh-TW`, `en`, `ms`, `th`, `vi`, `id`, `ta`, `my`, `km`, `hi`, `ar`, `ja`, `ko`, `fil`). The five newest locales cover the core game path and Arabic uses RTL; the admin translation workflow and exhaustive native translation of every legacy reference label are not yet complete.
- Migration 010 enables RLS on the listed sensitive tables and prepares the Supabase Realtime publication for `room_messages`. The browser does not call Supabase directly; custom Telegram signed `initData` plus server sessions are enforced in the API. Production policies still need review against the server-side access path before live traffic is enabled.

- The two supplied PPTX source files were found and rendered in the Windows workspace; their rendered evidence is stored under `docs/benchmark/source-pptx/`.
- The reference websites are external and may change after this audit. The design decisions in `docs/design/reference-audit.md` record the observed patterns and the date of review.
- The current project is a demo and keeps real-money actions disabled. No production payment or cash-out path is introduced by this redesign.
- Generated media availability depends on Higgsfield job completion and CDN reachability. The UI always has Tier B/C fallbacks.
