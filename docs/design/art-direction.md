# PROJECT 12 — THE 12 MECHANISM art direction

## Creative position

PROJECT 12 is a dark precision instrument for a Telegram-native demo. It should feel engineered, scarce, and legible: a black-titanium object held in a smoked-glass chamber, with movement only where the game state changes.

The interface is not a casino, not a reward wall, and not a cartoon game. It is a mechanism that exposes the round, the input, the rule version, and the resulting ledger entry.

## Material language

- Void: `#050505`; carbon: `#0B0B0C`; graphite: `#171719`.
- Brushed steel: `#92969D` with thin hairlines and measurement marks.
- Smoked glass: translucent graphite surfaces with depth, never frosted-card clutter.
- Brass: `#B48B52` and `#D0B176`, used for identity, focus, and verified state only.
- Signal amber: `#E9A343`, used for countdowns and user action.
- Positive/negative: `#73977D` / `#A84F49`, used only for settlement semantics.
- Bone/paper: `#F1EFE8` / `#D8D5CD` for typography.

## Composition rules

1. Use one dominant mechanism visual per screen; keep supporting data in a rail or table.
2. Use asymmetric editorial composition on the Hall and Rules screens; use measured instrument composition in Game and Wallet.
3. Use full-bleed media or a true open field. Do not create a wall of rounded cards.
4. Keep text overlays in HTML, not baked into generated images or videos.
5. Use large numerals as information, not decoration: round id, countdown, balance, packet amount, multiplier.
6. Every primary action must be visible, keyboard reachable, at least 44px high, and singular for the current state.

## Typography

Use a system sans for Chinese legibility and a condensed/monospaced treatment for data. Recommended stack:

```css
font-family: Inter, "SF Pro Display", "PingFang SC", "Noto Sans SC", sans-serif;
font-variant-numeric: tabular-nums;
```

Labels are uppercase, tracked, and small. Headlines are tight and editorial. Numbers are tabular and may be larger than the surrounding copy.

## Motion point of view

Motion is an instrument response: a ring indexes, an aperture opens, a measurement locks, or a state advances. It must never become a looping attention trap. Honor `prefers-reduced-motion` by replacing video with the poster and removing non-essential transforms.

## Responsive frame

- Primary concept frame: 390 × 844.
- Narrow Telegram fallback: 320px minimum.
- Large phone: 430 × 932.
- Desktop QA: 1440 × 900 with a centered 760px app column and no stretched phone mockup.
