# PROJECT 12 — Asset manifest

## Generated assets

| Asset | Source | Intended states | Fallback |
|---|---|---|---|
| `public/motion/12-mechanism-poster.webp` | Higgsfield GPT Image 2, original abstract precision mechanism | Hall, setup, rules, profile | CSS mechanism poster |
| `public/motion/12-mechanism-idle.mp4` | Higgsfield Seedance 2.0, poster-to-video | Hall idle | Poster |
| `public/motion/12-mechanism-open.mp4` | Higgsfield Seedance, aperture movement | Packet claim | Poster |
| `public/motion/12-mechanism-lock.mp4` | Higgsfield Seedance, ring indexing | Settlement | Poster |

Generated media must contain no text, logo, number, QR code, or interface. All product copy and numbers remain live HTML for localization and accessibility.

## Tier policy

- Tier A: poster + lightweight loop, used for the primary hero when available.
- Tier B: poster only with CSS ring/measurement response, used when video is slow or unsupported.
- Tier C: CSS-only mechanism, always available offline and under reduced motion.

## Performance budgets

- Poster: target ≤350KB WebP.
- Each mobile loop: target ≤3.5MB for the current 720p Hall loop, muted, `playsInline`, no autoplay sound.
- Lazy-load below-fold videos; do not block first contentful paint.
