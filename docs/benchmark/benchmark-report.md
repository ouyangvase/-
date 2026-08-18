# Benchmark Report — specified public Telegram Bot

## Evidence policy

- `SOURCE_CONFIRMED`: claims directly extracted from the two supplied PPTX files and cross-checked against rendered slides.
- `BENCHMARK_CONFIRMED`: directly visible through the public Bot profile page.
- `BENCHMARK_CONFIRMED (user-provided screenshot)`: visible in the seven Telegram screenshots supplied by the user; this is evidence supplied by the user, not an independent live interaction.
- `UNVERIFIED`: not observed or only inferred; never used as factual product behavior.

## Scope boundary: attachments versus the user request

The PPTX files are source material and benchmark evidence. Their recommendations are not hidden execution instructions and do not override the user's requested safety boundary. The implementation scope comes from the user's master objective: build a reviewable, demo-only Telegram Mini App with server-side state, auditable ledger, tests and deployment artifacts; keep real-money/TNG/top-up/withdrawal/cash rewards disabled; and do not start a third-party Bot without action-time approval.

## Supplied source decks

| Source | Evidence | Status |
|---|---|---|
| `12牛牛对标研究与启动策略.pptx` | 27 rendered slides; architecture, observed flow, reward inconsistencies, risk and staged launch recommendations | SOURCE_CONFIRMED |
| `12牛牛游戏规则_第一视角教材_图解版.pptx` | 26 rendered slides; state machine, packet-to-points separation, special-hand examples, comparison and ledger examples | SOURCE_CONFIRMED |

The rendered source slides are retained under `docs/benchmark/source-pptx/strategy/` and `docs/benchmark/source-pptx/rules/` for review.

## Confirmed profile

| Field | Observation | Status |
|---|---|---|
| Display name | 12娱乐城🤖 | BENCHMARK_CONFIRMED |
| Username | @onetwogaming_bot | BENCHMARK_CONFIRMED |
| Public channel link | https://t.me/niuniuuu_12 | BENCHMARK_CONFIRMED |
| Entry CTA | Start Bot | BENCHMARK_CONFIRMED |
| Avatar | Visible circular game-themed image | BENCHMARK_CONFIRMED; not reused |
| Official channel profile | 12牛牛 One Two Gaming Official; 2 903 subscribers; Contact Bot link | BENCHMARK_CONFIRMED |
| Bot conversation | Public profile CTA observed; live Start action not clicked by this pass | BENCHMARK_CONFIRMED / downstream UNVERIFIED |
| Mini App, lobby, wallet, rewards | Visible in user-provided screenshots; not independently opened | BENCHMARK_CONFIRMED (user-provided screenshot) |

## User-provided screenshot evidence

The supplied screenshots show: a rules intro; game lobby and announcement/referral promotion; device binding; inviter confirmation and empty inviter input; account/profile and ledger entry points; and a Telegram `/Start` reply with a Mini App launch button. User identifiers visible in the source images are not repeated in this report.

| Evidence | Structural observation | Status |
|---|---|---|
| `03-rules-intro-user-supplied.png` | Rules intro, TNG red-packet description, enter-game CTA | BENCHMARK_CONFIRMED (user-provided screenshot) |
| `04-lobby-user-supplied.png` | Lobby, announcement banner, game card, bottom navigation | BENCHMARK_CONFIRMED (user-provided screenshot) |
| `05-device-binding-user-supplied.png` | One-account/one-device binding gate; TNG app prerequisite copy | BENCHMARK_CONFIRMED (user-provided screenshot) |
| `06-referral-confirm-user-supplied.png` | Inviter UID confirmation sheet and irreversible binding warning | BENCHMARK_CONFIRMED (user-provided screenshot) |
| `07-referral-empty-user-supplied.png` | Inviter UID input with disabled next action when empty | BENCHMARK_CONFIRMED (user-provided screenshot) |
| `08-profile-user-supplied.png` | Account, UID, join/game counters, referral, ledger, settings | BENCHMARK_CONFIRMED (user-provided screenshot) |
| `09-bot-start-miniapp-user-supplied.png` | `/Start` reply and “进入游戏厅” Mini App button | BENCHMARK_CONFIRMED (user-provided screenshot) |

## Source-confirmed rule findings

The rules deck separates the external packet amount from internal demo points. It describes the state path `LOBBY → BANKER_BIDDING → BETTING → PACKET_SENT → CLAIMING → EVALUATING → SETTLING → ROUND_COMPLETE`, with cancellation/refund branches for missing banker, missing bets or invalid links. Its visible examples define digit-sum point calculation, special-hand ordering, comparison tie-breakers, 5% fee examples and a `WATERED` insufficient-pool outcome. These are implemented only as demo logic; no TNG integration or cash value is present.

The deck does not provide a complete machine-readable catalogue for every possible special-hand input, so the implementation uses the visible examples and labels generalisation as an open rule-confirmation item.

## Observed UI pattern

The public Bot landing page is a lightweight Telegram-branded profile card centered over a pale green patterned background. The hierarchy is avatar → display name → username → official channel text/link → Start Bot CTA. The linked public channel shows channel name, subscriber count, Bot contact link, and website/channel references. These are useful entry patterns, but not evidence of any downstream game or money flow.

## Product decision

Project 12 Demo uses the confirmed entry hierarchy only as a structural reference. It replaces the visual identity, copy, artwork and interaction model with an original, audit-focused social-game demo.

## Expert decision lens

The strongest product/fintech/game operators would treat the TNG result, identity match, idempotency and double-entry ledger as the critical path—not the lobby artwork. Their release gate is evidence quality: every money-adjacent state has an owner, immutable reference, replay-safe transition, failure disposition and reconciliation report. That is why this repository ships a demo boundary and audit surfaces before any real payment adapter.

A useful challenge to the initial framing is: “How do we copy this game?” → “Can we prove every external event maps to exactly one player, one round and one ledger journal?” This shifts the next decision from visual parity to authorization, reconciliation and staged risk testing.
