# Visual Fidelity Ledger

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
