# DECISIONS

1. Use centralized `PROJECT 12` placeholder branding until formal brand assets are supplied.
2. Treat PostgreSQL as the intended business source of truth and Redis as cache/lock infrastructure; the local browser fallback is explicitly demo-only.
3. Use an append-only double-entry ledger model even in demo mode. No user balance is mutated directly.
4. Keep all real-money, payment, top-up, withdrawal, TNG, and cash-reward paths disabled at the server boundary.
5. Preserve the opponent's information architecture only as benchmark evidence; use original visual language and copy.
6. The supplied rules PPTX is `SOURCE_CONFIRMED` for its visible examples; the demo uses a versioned, clearly labeled example-based rule set and does not claim a complete production catalogue.
7. Use the Apple-style dark Telegram-native page override in `design-system/project-12/pages/miniapp.md`; the generated Master file remains a searchable baseline, not the final Mini App palette.
