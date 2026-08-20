# DECISIONS

## 2026-08-21 goal/telegram-internal-chat-game

1. The latest real screenshots and the latest Master Goal are the source of truth for the new branch. The internal Mini App chat is the game surface; a Telegram native group is not the game authority.
2. The first localization release targets `zh-CN`, `en`, `ms`, `th`, `vi`, and `id`. System messages and Bot notifications are template keys plus payloads; player-authored text is not machine-translated.
3. The app remains mobile-first with a 390×844 reference, a 480px maximum content width, and Telegram-provided shell/safe-area controls. No fake iPhone/Telegram chrome is drawn inside the Mini App.
4. Real-money, TNG payment automation, top-up, withdrawal, and cash rewards stay disabled until legal/provider authorization and an explicit production go-live gate are satisfied.
5. PostgreSQL/Supabase is the fact source for chat, rounds and ledger; Realtime is delivery, and a long-running worker owns timers, auto-claim and settlement. Every financial mutation remains double-entry and idempotent.
6. Screenshots are used to reproduce information architecture, states, density and interaction behavior. Third-party branding, bot credentials and private data are not copied.

1. Use centralized `PROJECT 12` placeholder branding until formal brand assets are supplied.
2. Treat PostgreSQL as the intended business source of truth and Redis as cache/lock infrastructure; the local browser fallback is explicitly demo-only.
3. Use an append-only double-entry ledger model even in demo mode. No user balance is mutated directly.
4. Keep all real-money, payment, top-up, withdrawal, TNG, and cash-reward paths disabled at the server boundary.
5. Preserve the opponent's information architecture only as benchmark evidence; use original visual language and copy.
6. The supplied rules PPTX is `SOURCE_CONFIRMED` for its visible examples; the demo uses a versioned, clearly labeled example-based rule set and does not claim a complete production catalogue.
7. Use the Apple-style dark Telegram-native page override in `design-system/project-12/pages/miniapp.md`; the generated Master file remains a searchable baseline, not the final Mini App palette.
