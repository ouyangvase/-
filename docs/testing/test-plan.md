# Test Plan

- Unit: point calculation, hand classification, HMAC packet repeatability, ledger balance and negative-balance prevention.
- Integration: API idempotency, demo claim, settlement, disabled money routes, Telegram initData signature validation.
- E2E: onboarding, lobby/round centre, bet, packet claim, settlement, missions, referral, profile and Admin dashboard.
- Load: 100 simulated users, 20 rounds, duplicate and delayed requests; assert no duplicate settlement, negative balance or ledger drift.
