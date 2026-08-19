# Visual Fidelity Ledger

## Mechanism redesign — 2026-08-20

The table below supersedes the historical pre-redesign checks in the original file. Concept captures are stored in `docs/design/concepts/` at 390 × 844.

| Checkpoint | Evidence | Result |
|---|---|---|
| Material direction | Higgsfield hero poster + mechanism CSS fallback | black titanium / brushed steel / smoked glass / restrained brass |
| Hall hierarchy | `06-hall.png` | one hero object, one live round, one next action; no game-card grid |
| Rules comprehension | `07-rules-overview.png`, `08-rules-scrolled.png` | eight source-confirmed states, sticky active step, live HTML copy |
| Game state | `09-banker-bidding.png` through `13-settlement.png` | state rail, one primary action, measurement data, settlement evidence |
| Ledger trust | `14-wallet-ledger.png` | oversized balance, references, changes, balance-after, no cash action |
| Telegram context | `15-telegram-destinations.png` | five explicit destinations and graceful unconfigured state |
| Account/network | `16-profile-network.png` | editorial settings list and private-network language |
| Responsive shell | all 16 captures at 390 × 844 | edge-to-edge bottom rail, no horizontal overflow observed |

## Mismatch ledger

- Tier A hero video is not yet wired into the default visual because the generated motion job must be checked for temporal consistency before being shipped. The static Higgsfield poster is wired and is the source of truth.
- Telegram’s native header and MainButton cannot be reproduced in a desktop browser; the local QA shell uses the in-app fallback header while the bridge remains active in Telegram.
- The current demo uses a controlled static state snapshot until the API/realtime service is available; this is a deliberate demo limitation, not a visual approximation.

## Historical pre-redesign checks

Concept source: `docs/design/project12-mobile-concept.png`.

| Checkpoint | Concept evidence | Browser evidence | Result |
|---|---|---|---|
| Palette | Apple-style #0b0c10 canvas, Telegram blue, muted gold | `project12-hall-390x844.png`, `project12-admin-1440x900.png` | matched |
| First viewport hierarchy | Brand, demo-credit indicator, announcement, game card, primary CTA | `project12-hall-390x844.png` at 390×844 | matched |
| Round Centre anatomy | Round, rule version, countdown, banker, bet chips, fairness | E2E flow at six mobile sizes | matched |
| Fairness state | Inspectable seed/hash and rule version | `GameRoom` fairness panel | matched |
| Ledger/admin trust surface | Append-only journal and operational audit | `admin-ledger.png`, `admin-round-audit.png` at 1280×900 | matched |
| Responsive behavior | Mobile-first cards and bottom navigation | Browser viewport 390×844 | matched |

Intentional deviations: the concept image contains illustrative placeholder copy and a stylized card-game label; implementation uses explicit Project 12 Demo copy and only code-native UI text so the UI remains accessible and interactive. No real-money visual language was added.
