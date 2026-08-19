# PROJECT 12 — Component inventory

## Mechanism namespace

`apps/miniapp/src/components/mechanism/`

- `MechanismVisual`: generated poster/video with a stable poster fallback, state label, and reduced-motion behavior.
- `PrecisionDial`: keyboard and pointer-safe amount control with min/max/step and text value.
- `HoldAction`: optional hold-to-confirm interaction with a click/keyboard fallback and visible progress.
- `StateRail`: canonical round state sequence; active/done/error styling is data-driven.
- `mechanism.css`: namespace styles for the media and instrument primitives.

## Screen composition

- `Setup`: onboarding state machine; preserve device, referrer, and PIN handlers.
- `Hall`: one hero mechanism, one live round, open evidence rail.
- `Rules`: scroll-led source-confirmed teaching flow.
- `GameRoom`: state-dependent single-action instrument.
- `Wallet`: balance and open ledger, with disabled demo money actions.
- `Chat`: five Telegram destinations with graceful unconfigured states.
- `Profile`: account/security/referral/ledger/preferences/support/legal list.
- `Referral`: private network metrics and immutable binding confirmation.

## Accessibility contract

All interactive elements use native buttons/inputs where possible. Targets are ≥44px, focus is visible, amount inputs expose `aria-valuetext`, video has a poster, and reduced motion removes non-essential animation.
