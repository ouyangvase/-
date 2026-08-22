# Telegram Setup (later, with user-supplied credentials)

1. Create a Bot in BotFather and keep the token in a secret manager or local `.env`; never expose it to the Mini App or logs.
2. Set the Main Mini App domain to the HTTPS Vercel origin. The `/start` reply button and Bot Menu Button open the Mini App with `web_app`; they are not ordinary browser links.
3. Configure the Menu Button, commands and webhook with `pnpm telegram:configure` from a server environment. The webhook target is `/api/telegram/webhook`.
4. Configure a webhook URL and secret; validate Telegram `initData` server-side.
5. Apply `infra/schema.sql` and all ordered `infra/migrations/*.sql` files (including `006-persistent-internal-packets.sql`, `007-telegram-launch-grants.sql` and `010-internal-chat-permissions.sql`) to Supabase/Postgres, then run `pnpm db:seed` once. The seed creates the canonical Project 12 room/round, system demo-credit accounts and rule records; it does not reset an existing round state.
6. Run `pnpm telegram:verify` after `pnpm telegram:configure`; it checks the Bot identity, webhook URL, Menu Button URL and command list without printing the Bot token.
7. Test only with demo credits and verify the health endpoint before opening the app.

## The exact round flow

The Mini App’s internal room is the only public game stream. Telegram native groups are not required and are not a source of truth. Players send banker and bet actions in the internal room; the API validates the command, writes the round event and an outbox record, and the internal system user publishes the resulting state message. When betting closes, the API creates one internal packet with `maxClaims` equal to the successful bettors, writes one private participant message per bettor, and the server rejects any spectator claim. The Bot may send private status or entry notifications, but it does not store the room, calculate the game or edit balances.

The participant-only packet card is filtered server-side by `round_participants` and `packet_allocations`; hiding a card in the browser is not the permission boundary.

For a local operator shell, pull the authorized Vercel environment without printing its values, then run the checks from the repository root:

```bash
npx vercel env pull .env.staging.local --environment production
pnpm db:migrate
pnpm db:seed
pnpm telegram:configure
pnpm telegram:verify
pnpm staging:preflight
```

`.env.staging.local` is ignored by Git. The scripts load it automatically and never echo its secrets.

The Vercel webhook handles `/start` replies and retry-safe delivery directly. Deploy the long-running Worker separately for approval notifications, private status notifications and expiry transitions. Set `REQUIRE_WORKER=true` after that Worker is healthy; without it, the API can accept writes but the notification outbox will not be delivered.

The API uses the `pg` driver directly against Supabase Postgres. For production Realtime, configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) and the Supabase project `SUPABASE_JWT_SECRET` server-side. The API signs a five-minute JWT for the verified database user, and the Mini App joins the private `room-12` channel with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The `014-private-realtime-chat.sql` migration limits Realtime reads and presence writes to active `room_members`; the server/worker broadcast with the service key. Apply `015-chat-attachments.sql` before enabling production photo messages so the server-side upload bucket exists. SSE remains the permission-filtered fallback when the optional Realtime client is unavailable. Participant-only packet messages are never broadcast, and no service key belongs in the Mini App bundle. Use `DATABASE_URL` for the serverless API/Worker and `DIRECT_URL` for migrations when the provider exposes separate pooler and direct connection strings.

The repository currently uses mock Telegram authentication only when `APP_MODE=demo` and `TELEGRAM_MOCK_ENABLED=true`. Outside demo, `/api/auth/telegram` accepts either fresh signed `initData` or a short-lived, one-time launch grant issued by the webhook for reply-keyboard `/start` launches. Never put the Bot token in client-side environment variables.

After loading the authorized staging environment, run `pnpm staging:preflight`. It checks only boolean/structural results: required variable names, Project 12 schema readiness, Bot identity, webhook URL, Menu Button URL, commands and public API health. It never prints token, password, webhook secret, connection string or full `initData`.
