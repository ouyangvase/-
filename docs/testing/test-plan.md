# Test Plan

- Unit: point calculation, hand classification, HMAC packet repeatability, two-decimal fee/ledger balance and negative-balance prevention.
- Integration: `scripts/api-smoke.mjs` covers HttpOnly cookie issuance, API idempotency, demo claim, settlement, disabled money routes and onboarding; `scripts/staging-gate.mjs` verifies unsigned auth, default admin-token rejection and missing webhook-secret rejection in staging.
- E2E: onboarding, lobby/round centre, bet, packet claim, settlement, missions, referral, profile and Admin dashboard across six mobile viewports; a Telegram-runtime guard verifies that a signed Telegram container cannot continue on the offline Demo fallback.
- Visual: `tests/e2e/visual-qa.spec.ts` captures 19 named baseline states, including banker bidding and WIN/LOSE/TIE/WATERED settlement branches.
- Load: 100 simulated users, 20 rounds, duplicate and delayed requests; assert no duplicate settlement, negative balance or ledger drift.
