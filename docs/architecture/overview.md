# Architecture Overview

`PostgreSQL` is the intended business source of truth. `Redis` is for locks, cache and rate limits. Frontend state is presentation only. Telegram messages are notifications only. The game engine, ledger and API own business decisions.

The local build contains Mini App, Admin, API, Bot and Worker surfaces. The API runs a deterministic in-memory demo state when no database is configured; this makes UI work reproducible while keeping the production boundary explicit.
