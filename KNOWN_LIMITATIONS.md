# Known limitations

## New-goal blockers (2026-08-21)

- Real Telegram Gate A is blocked by missing owner-supplied Bot token and BotFather configuration; the existing external `@onetwogaming_bot` cannot be used or rewired.
- Supabase project reference `xytaavjiszdjumbaqapx` is known, but a dashboard URL is not a server credential. No service key or database connection string has been written into this workspace.
- The current branch is still a safe Demo runtime. It must not be described as a production wallet, payment or cash-redemption system.
- The screenshot-derived internal chat flow is implemented in Demo mode, including banker/bet commands, `shN`, close-betting, participant-only packet access and authenticated SSE. It still needs production integration testing after Supabase and Telegram credentials are configured.
- Six user-facing locale dictionaries are implemented (`zh-CN`, `en`, `ms`, `th`, `vi`, `id`). The admin translation workflow and exhaustive translation of every legacy reference label are not yet complete.
- The migration prepares the Supabase Realtime publication for `room_messages`, but the API currently serves the authenticated SSE stream. RLS is deliberately not enabled because the current identity boundary is Telegram signed `initData` plus server sessions, not Supabase Auth JWT claims; enabling generic policies now would either deny the API service or create an unsafe bypass.

- The two supplied PPTX source files were found and rendered in the Windows workspace; their rendered evidence is stored under `docs/benchmark/source-pptx/`.
- The reference websites are external and may change after this audit. The design decisions in `docs/design/reference-audit.md` record the observed patterns and the date of review.
- The current project is a demo and keeps real-money actions disabled. No production payment or cash-out path is introduced by this redesign.
- Generated media availability depends on Higgsfield job completion and CDN reachability. The UI always has Tier B/C fallbacks.
