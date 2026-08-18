# Rule Evidence

## Evidence status

The supplied rules deck is available locally, rendered and text-extracted. The statements below are `SOURCE_CONFIRMED` as claims about the deck, not proof that the benchmark's live backend enforces them. The implementation is a simulation only.

Source: `12牛牛游戏规则_第一视角教材_图解版.pptx` (26 slides), retained under `docs/benchmark/source-pptx/rules/`.

## Source-confirmed examples

- Packet amount is an input to point calculation; it is not added to the internal points balance.
- Example point calculation: `RM3.42 → 3 + 4 + 2 → 9 points`; a zero result is represented as 10 points.
- Visible special-hand examples and multipliers: 豹子 `17×` (`7,7,7`), 满牛 `15×` (`8,8,0`), 反顺 `14×` (`9,8,7`), 顺子 `13×` (`1,2,3`), 对子 `12×` (`7,5,5`), 金牛 `11×` (`0,5,0`).
- Visible hand ranking: 豹子 > 满牛 > 反顺 > 顺子 > 对子 > 金牛 > 普通.
- Comparison examples use hand type, then points, then packet amount; equal amount is a tie.
- Visible accounting examples use a 5% fee and show a `WATERED` outcome that returns the bet with zero bonus/fee when the banker pool cannot cover the required payout.

## Implementation boundary

`packages/game-engine` now uses rule version `demo-v1-source-confirmed-examples`. Ordinary hands use their calculated points as the multiplier. The special-hand detector intentionally encodes the visible examples and does not claim a complete official catalogue. Packet values are deterministic HMAC demo values, not TNG claims.

The real-money boundary remains hard-disabled: no TNG API, Money Packet creation, claim-result ingestion, top-up, withdrawal, cash reward or cash commission is implemented.

## Open confirmation items

- Complete special-hand catalogue and whether examples are order-sensitive.
- Official fee/multiplier versioning and effective dates.
- Exact timeout and tail-packet policy in the live system.
- Authoritative source and legal permission for any TNG claim-result integration.
