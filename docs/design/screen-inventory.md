# PROJECT 12 — Screen inventory

The following 16 concepts are the acceptance set. They are states of one phone-width system, not 16 separate themes.

| # | Screen / state | Required evidence | Primary action |
|---:|---|---|---|
| 01 | Boot / Telegram handoff | PROJECT 12 mark, demo disclosure, loading state | Continue |
| 02 | Device binding | security rationale, current device state | Bind this device |
| 03 | Referrer input | immutable relationship warning | Next |
| 04 | Referrer confirmation | selected UID and irreversible consequence | Confirm binding |
| 05 | PIN setup | matching PIN validation and trust copy | Save security PIN |
| 06 | Hall / mechanism idle | hero mechanism, `R-0247`, online count, next round | Enter round |
| 07 | Rules / 8-step overview | sticky mechanism + active step | Enter game |
| 08 | Rules / special-hand examples | source-confirmed examples only | Back to round |
| 09 | Game / banker bidding | bid amount and state rail | Confirm bid |
| 10 | Game / betting | stake selection and locked balance | Lock stake |
| 11 | Game / packet claim | packet input, fairness hash, open action | Claim demo packet |
| 12 | Game / evaluating | packet amount, points conversion, waiting state | View settlement |
| 13 | Settlement / WIN | gross, fee, net, principal, before/after | Return to hall |
| 14 | Wallet / open ledger | balance, available/locked, references | View ledger |
| 15 | Telegram destinations | room / announcement / support routing | Open destination |
| 16 | Profile / private network | direct / qualified / pending / held / confirmed | Open referral |

## Shared invariants

- Only one primary CTA is emphasized in a state.
- Demo credit and no-cash-value language stays visible near monetary-looking values.
- Backend handlers and the authoritative game engine remain unchanged by the visual layer.
- Telegram back button and MainButton are configured for screens where the host supports them.
