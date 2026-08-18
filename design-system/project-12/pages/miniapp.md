# Mini App page override

The generated Master file is the search baseline. This page override is authoritative for the Telegram Mini App because the product is a Telegram-native, Apple-style dark surface rather than a marketing landing page.

## Tokens

- Canvas: `#0b0c10`; elevated canvas: `#111218`; primary surface: `#1d1e25`; raised surface: `#25262d`.
- Text: `#f5f5f7`; secondary text: `rgba(235,235,245,.72)`; tertiary text: `rgba(235,235,245,.46)`.
- Accent: Telegram blue `#0a84ff`; pressed blue `#0071e3`; success `#30d158`; warning `#ff9f0a`; danger `#ff453a`.
- Game gold is reserved for the original 12牛牛 mark and special-hand emphasis: `#e6b84a` / `#ffe08a`.
- Divider uses 10% white; strong stroke uses 16% white. Avoid large gradients, red casino language, competitor logos and third-party artwork.

## Layout contract

- Mobile-first with `min-height: 100dvh`, `viewport-fit=cover`, Telegram content-safe-area variables and bottom-nav padding.
- Four persistent nav items only: `大厅`, `钱包`, `聊天`, `我`.
- Controls are at least 44px high; cards use 16–20px radius; section rhythm follows 8px increments.
- Do not reproduce the host app's status bar, Dynamic Island, close/back shell or Telegram header inside the Mini App.
- Use inline SVG icons with accessible labels; emoji are not structural icons.

## Motion and behavior

- Use 150–300ms transform/opacity transitions. Respect `prefers-reduced-motion`.
- On Telegram, call `ready`, `expand`, supported fullscreen, safe-area updates, BackButton and haptics through `packages/telegram/src/telegram-bridge.ts`.
- Onboarding is a blocking device → referrer → PIN flow. Referral binding is a confirmation sheet. Demo money actions are visibly disabled and never imply cash value.

## QA targets

Validate Mini App at 375×667, 390×844, 430×932, 360×800, 412×915 and 480×900. Validate Admin separately at 1440×900. Check no horizontal scroll, no clipped controls, keyboard focus, readable contrast and bottom-safe-area clearance.
