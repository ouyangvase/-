# Telegram Setup (later, with user-supplied credentials)

1. Create a Bot in BotFather only after a Bot name and username are explicitly supplied.
2. Keep the Bot token in a secret manager or local `.env`; never expose it to the Mini App or logs.
3. Set the Mini App domain to the HTTPS Vercel origin. `/newapp` is optional; the `/start` reply keyboard and Bot Menu Button use `web_app` directly.
4. Configure the Menu Button, commands and webhook with `pnpm telegram:configure` from a server environment. The webhook target is `/api/telegram/webhook`.
5. Configure a webhook URL and secret; validate Telegram `initData` server-side.
6. Apply `infra/schema.sql` and all ordered `infra/migrations/*.sql` files (including `006-persistent-internal-packets.sql` and `007-telegram-launch-grants.sql`) to the Supabase/Postgres database before enabling staging mode. Migration `007` makes the reply-keyboard `/start` launch a one-time authenticated Mini App session.
7. Run `pnpm telegram:verify` after `pnpm telegram:configure`; it checks the Bot identity, webhook URL, Menu Button URL and command list without printing the Bot token.
8. Test only with demo credits and verify the health endpoint before opening the app.

The Vercel webhook handles `/start` replies and retry-safe delivery directly. Set `REQUIRE_WORKER=true` only when you deploy the long-running Worker for background outbox notifications; it is not required for the Bot → Mini App launch path.

The API uses the `pg` driver directly against Supabase Postgres; it does not use Supabase REST, the Supabase client SDK or Supabase Realtime. Use `DATABASE_URL` for the serverless API/Worker and `DIRECT_URL` for migrations when the provider exposes separate pooler and direct connection strings. No Supabase secret key belongs in the Mini App bundle.

The repository currently uses mock Telegram authentication only when `APP_MODE=demo` and `TELEGRAM_MOCK_ENABLED=true`. Outside demo, `/api/auth/telegram` accepts either fresh signed `initData` or a short-lived, one-time launch grant issued by the webhook for reply-keyboard `/start` launches. Never put the Bot token in client-side environment variables.
