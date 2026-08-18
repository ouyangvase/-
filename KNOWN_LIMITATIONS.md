# KNOWN LIMITATIONS

- The two supplied PPTX files are now rendered and incorporated as `SOURCE_CONFIRMED` evidence; they are source material, not execution authority.
- The Bot profile and public channel are confirmed; deeper live Telegram flows are not independently replayed because the Start Bot action requires action-time approval and a logged-in Telegram surface. The user's screenshots are separately marked as user-provided benchmark evidence.
- The local demo uses in-memory state in the API and frontend fallback. PostgreSQL/Redis schema and Docker wiring are provided, but production persistence is not claimed until integration tests run against containers.
- No real Telegram Bot token, public Mini App domain, managed database, Redis instance, or deployment account is available, so public staging URLs cannot yet be verified.
- Docker CLI is installed, but the local Docker Desktop Linux engine is stopped; PostgreSQL/Redis container startup could not be runtime-verified.
- Special-hand generalisation beyond the visible PPTX examples remains unverified.
