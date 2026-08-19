# PROJECT 12 — Motion system

## Principles

Motion confirms state; it does not decorate waiting time. All video is muted, inline, and optional. The poster is the truth at first paint.

## Tokens

```css
--ease-mechanism: cubic-bezier(.22, .75, .24, 1);
--ease-lock: cubic-bezier(.2, .8, .2, 1);
--duration-micro: 140ms;
--duration-state: 520ms;
--duration-hero: 1200ms;
```

## State mapping

| State | Motion | Duration | Reduced-motion behavior |
|---|---|---:|---|
| Boot | one slow ring index | 1200ms | static poster |
| Hall idle | barely perceptible aperture breathing | loop, 6s | static poster |
| Banker bidding | dial mark advances on amount change | 140ms | immediate update |
| Betting | ring locks at selected stake | 520ms | immediate lock |
| Packet claim | aperture opens, value appears after claim | 520ms | poster + live value |
| Evaluating | three measurement marks resolve | 1200ms | static measurement layout |
| Settlement | central ring stops and status color changes | 520ms | immediate result |

## Interaction rules

- No parallax, cursor-following, or infinite decorative shimmer.
- Use haptics only at meaningful transitions, respecting Telegram availability.
- Never hide the CTA while a motion is running.
- Error and reduced-motion states must have equivalent content, not only equivalent styling.
