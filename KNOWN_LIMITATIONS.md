# Known limitations

- The two supplied PPTX source files were found and rendered in the Windows workspace; their rendered evidence is stored under `docs/benchmark/source-pptx/`.
- The reference websites are external and may change after this audit. The design decisions in `docs/design/reference-audit.md` record the observed patterns and the date of review.
- The current project is a demo and keeps real-money actions disabled. No production payment or cash-out path is introduced by this redesign.
- Generated media availability depends on Higgsfield job completion and CDN reachability. The UI always has Tier B/C fallbacks.
