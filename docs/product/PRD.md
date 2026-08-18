# Product Requirements — Project 12 Demo

Project 12 Demo is a Telegram social-game prototype using simulation credits only.

## Success criteria

- A demo player can onboard with a referral code, open the lobby, join a round, place a simulated bet, claim a deterministic demo packet, inspect fairness evidence and settle the round.
- Every credit movement is represented by a balanced double-entry journal.
- Repeat writes with the same idempotency key replay the original result.
- Top-up, withdrawal, TNG and cash rewards are hard-disabled server-side.
- An operator can inspect round state, ledger entries, risk queue and audit history.

## Non-goals

Real money, payments, cash-out, cash commissions, KYC collection, TNG automation and production Bot creation are out of scope for this demo.
