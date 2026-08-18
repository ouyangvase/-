# Telegram Setup (later, with user-supplied credentials)

1. Create a Bot in BotFather only after a Bot name and username are explicitly supplied.
2. Keep the Bot token in a secret manager or local `.env`; never expose it to the Mini App or logs.
3. Set the Mini App domain to an HTTPS staging URL.
4. Configure the menu button and commands from the approved list.
5. Configure a webhook URL and secret; validate Telegram `initData` server-side.
6. Test only with demo credits and verify the health endpoint before opening the app.

The repository currently uses mock Telegram authentication only when `APP_MODE=demo` and `TELEGRAM_MOCK_ENABLED=true`. Outside demo, `/api/auth/telegram` returns `TELEGRAM_SIGNED_INIT_DATA_REQUIRED` unless a Bot token and fresh signed `initData` are supplied. Never put the Bot token in client-side environment variables.
