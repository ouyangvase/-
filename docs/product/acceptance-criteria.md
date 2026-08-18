# Acceptance Criteria

1. Onboarding requires a demo referral code and displays no-cash language.
2. A round exposes a state, rule version, server countdown, banker, bet lock, claim, result and fairness proof.
3. The backend rejects payment, top-up and withdrawal writes with `REAL_MONEY_DISABLED`.
4. A journal has equal debit and credit totals.
5. Duplicate idempotency keys do not create another state change.
6. Admin surfaces show current round, ledger and audit evidence.
