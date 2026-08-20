# Telegram Setup (later, with user-supplied credentials)

1. Create a Bot in BotFather and keep the token in a secret manager or local `.env`; never expose it to the Mini App or logs.
2. Set the Mini App domain to the HTTPS Vercel origin. `/newapp` is optional; the `/start` reply keyboard and Bot Menu Button use `web_app` directly.
3. Add the Bot to the game group as an administrator with permission to post messages. The numeric group ID (normally beginning with `-100`) is `TELEGRAM_GAME_GROUP_CHAT_ID`. The Bot posts public round messages there; it never posts private claim links there.
4. Configure the Menu Button, commands and webhook with `pnpm telegram:configure` from a server environment. The webhook target is `/api/telegram/webhook`.
5. Configure a webhook URL and secret; validate Telegram `initData` server-side.
6. Apply `infra/schema.sql` and all ordered `infra/migrations/*.sql` files (including `006-persistent-internal-packets.sql` and `007-telegram-launch-grants.sql`) to the Supabase/Postgres database, then run `pnpm db:seed` once. The seed creates the canonical Project 12 room/round, system demo-credit accounts and rule records; it does not reset an existing round state. Migration `007` makes the reply-keyboard `/start` launch a one-time authenticated Mini App session.
7. Run `pnpm telegram:verify` after `pnpm telegram:configure`; it checks the Bot identity, webhook URL, Menu Button URL and command list without printing the Bot token.
8. Test only with demo credits and verify the health endpoint before opening the app.

## The exact round flow

The Telegram group is the public event stream. Players send their banker/bet actions through the Mini App or the configured Bot flow; the API writes the round event and an outbox record. The Worker publishes the safe public message to the group. When betting closes, the API creates one internal Demo packet with `maxClaims` equal to the number of bettors, writes one private outbox event per bettor, and the Worker sends each bettor a private Bot message with a Web App “打开平台红包” button. Spectators may see the public “下注意结束” message, but they are not in the recipient list and the claim API rejects them.

The Mini App is not a replacement for Telegram’s native group chat. It is the authenticated control surface for onboarding, wallet, game controls and private packet claiming; the Telegram group remains the chat room players watch.

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

The Vercel webhook handles `/start` replies and retry-safe delivery directly. Deploy the long-running Worker separately for group broadcasts, approval notifications, private packet notifications and expiry transitions. Set `REQUIRE_WORKER=true` after that Worker is healthy; without it, the API can accept writes but the Telegram outbox will not be delivered.

The API uses the `pg` driver directly against Supabase Postgres; it does not use Supabase REST, the Supabase client SDK or Supabase Realtime. Use `DATABASE_URL` for the serverless API/Worker and `DIRECT_URL` for migrations when the provider exposes separate pooler and direct connection strings. No Supabase secret key belongs in the Mini App bundle.

The repository currently uses mock Telegram authentication only when `APP_MODE=demo` and `TELEGRAM_MOCK_ENABLED=true`. Outside demo, `/api/auth/telegram` accepts either fresh signed `initData` or a short-lived, one-time launch grant issued by the webhook for reply-keyboard `/start` launches. Never put the Bot token in client-side environment variables.

After loading the authorized staging environment, run `pnpm staging:preflight`. It checks only boolean/structural results: required variable names, Project 12 schema readiness, Bot identity, webhook URL, Menu Button URL, commands and public API health. It never prints token, password, webhook secret, connection string or full `initData`.
