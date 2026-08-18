# Test Plan

- Unit: point calculation, hand classification, HMAC packet repeatability, ledger balance and negative-balance prevention.
- Integration: `scripts/api-smoke.mjs` covers HttpOnly cookie issuance, API idempotency, demo claim, settlement, disabled money routes and onboarding; staging mode is separately checked to reject unsigned auth.
- E2E: onboarding, lobby/round centre, bet, packet claim, settlement, missions, referral, profile and Admin dashboard across six mobile viewports.
- Visual: `tests/e2e/visual-qa.spec.ts` captures 19 named baseline states, including banker bidding and WIN/LOSE/TIE/WATERED settlement branches.
- Load: 100 simulated users, 20 rounds, duplicate and delayed requests; assert no duplicate settlement, negative balance or ledger drift.
