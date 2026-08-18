# Telegram Bot setup

This repository contains a safe Bot service. In local Demo mode it exposes `/health` and `/telegram/webhook` without sending; with an operator-supplied token it configures commands/Menu Button, registers the webhook and sends validated `/start` responses through the Telegram Bot API.

## BotFather checklist

1. Create a bot in BotFather and keep the token in a secret manager only.
2. Set the display name, username and description from the central brand configuration.
3. Configure the Mini App URL as the HTTPS staging or production origin.
4. Set the Menu Button to `进入 PROJECT 12` with the Web App URL. Configure the Main Mini App to `打开 12牛牛` with the same URL. The local payload builders are `buildMenuButtonConfig()` and `buildMainMiniAppConfig()`.
5. Set these commands: `/start`, `/play`, `/wallet`, `/history`, `/missions`, `/referral`, `/rules`, `/support`. The descriptions are centralized in `apps/bot/src/bot.ts`.
6. Set `TELEGRAM_WEBHOOK_URL` to the public Bot service endpoint and configure the webhook URL plus secret token. Reject requests with a missing or invalid secret.
7. Test `/start`, `/start ref_<code>`, the Web App button, Menu Button, Main Mini App, back navigation and initData verification.

The local service contract is implemented in `apps/bot/src/bot.ts`: `buildWelcomeMessage()`, `handleTelegramUpdate()`, `GET /health` and `POST /telegram/webhook`. `TELEGRAM_MOCK_ENABLED=true` remains the only supported local mode. Real Telegram delivery is intentionally blocked until the deployment owner supplies a bot token, HTTPS origin and webhook authorization.
