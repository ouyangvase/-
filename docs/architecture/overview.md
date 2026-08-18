# Architecture Overview

`PostgreSQL` is the intended business source of truth. `Redis` is for locks, cache and rate limits. Frontend state is presentation only. Telegram messages are notifications only. The game engine, ledger and API own business decisions.

The local build contains Mini App, Admin, API, Bot and Worker surfaces. The API runs a deterministic in-memory demo state when no database is configured; this makes UI work reproducible while keeping the production boundary explicit. Round transitions append `round_events`, enqueue an `outbox_events` record and expose a read-only SSE snapshot at `/api/rounds/:id/realtime`; the Worker owns the single-flight advancement boundary.

Authentication is server-side Telegram `initData` verification followed by an expiring `HttpOnly` `p12_session` cookie. Device onboarding generates an ECDSA P-256 key pair and stores it through Telegram SecureStorage when available; the API binds the public key once and requires a controlled recovery path for replacement.
