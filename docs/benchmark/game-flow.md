# Game Flow

## Source-confirmed teaching flow

The supplied rules deck presents this eight-step path:

`LOBBY → BANKER_BIDDING → BETTING → PACKET_SENT → CLAIMING → EVALUATING → SETTLING → ROUND_COMPLETE`

It also describes cancellation/refund branches for no banker, no bets and invalid links, and a `CLAIMING` hold when a participant's amount has not arrived.

## Demo implementation

The safe demo exposes the simplified, server-owned path:

`LOBBY → BANKER_BIDDING → BETTING → PACKET_SENT → CLAIMING → EVALUATING → SETTLING → ROUND_COMPLETE`

The frontend countdown is presentation only. Every write carries an idempotency key; the API applies a balanced journal for bet lock and settlement. This is a testable simulation and not a live TNG result pipeline.
