# Visual QA — PROJECT 12

Date: 2026-08-19

## Browser evidence

| Surface | Size | Evidence | Result |
|---|---:|---|---|
| Onboarding | 375×667 | `docs/benchmark/screenshots/project12-onboarding-375x667.png` | pass |
| Onboarding | 390×844 | `docs/benchmark/screenshots/project12-onboarding-390x844.png` | pass |
| Onboarding | 430×932 | `docs/benchmark/screenshots/project12-onboarding-430x932.png` | pass |
| Full Mini App E2E | 360×800, 412×915, 480×900 | Playwright projects in `playwright.config.ts` | pass |
| Admin dashboard | 1440×900 | `docs/benchmark/screenshots/project12-admin-1440x900.png` | pass |

## Scorecard

| Dimension | Score | Notes |
|---|---:|---|
| Hierarchy and task clarity | 19/20 | Onboarding and round CTA are unambiguous; deeper screens use a clear back action. |
| Telegram-native behavior | 18/20 | Bridge covers ready/expand/fullscreen/safe area/back/haptics; live signed initData still needs a supplied Bot token for staging verification. |
| Safety and trust | 20/20 | Demo-only labels, disabled cash actions, fairness details, ledger references and admin audit surfaces are visible. |
| Responsive layout | 19/20 | Six mobile dimensions pass the same E2E flow; safe-area variables are wired. |
| Accessibility and motion | 18/20 | Labels, focus styles, roles, 44px controls and reduced motion are present; a full screen-reader audit remains a staging task. |
| **Total** | **94/100** | Suitable for demo/staging handoff; live Telegram and production data checks remain gated. |

## Known visual limitations

- The Telegram host chrome is intentionally not reproduced in the Mini App. The screenshots therefore show only app content, not the iPhone status bar or Telegram header.
- Original CSS artwork is intentionally simple and code-native. It avoids reusing the competitor's cow/logo/banner assets.
