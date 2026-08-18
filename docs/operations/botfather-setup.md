# Telegram Bot setup

This repository contains a safe, non-sending Bot adapter. It builds the `/start` response and a Telegram Web App button, but it never sends a message without an operator-supplied token and an explicit deployment step.

## BotFather checklist

1. Create a bot in BotFather and keep the token in a secret manager only.
2. Set the display name, username and description from the central brand configuration.
3. Configure the Mini App URL as the HTTPS staging or production origin.
4. Set the Menu Button to `进入 PROJECT 12` with the Web App URL. Configure the Main Mini App to `打开 12牛牛` with the same URL. The local payload builders are `buildMenuButtonConfig()` and `buildMainMiniAppConfig()`.
5. Set these commands: `/start`, `/play`, `/wallet`, `/history`, `/missions`, `/referral`, `/rules`, `/support`. The descriptions are centralized in `apps/bot/src/bot.ts`.
6. Configure the webhook URL and a secret token on the server. Reject requests with a missing or invalid secret.
7. Test `/start`, `/start ref_<code>`, the Web App button, Menu Button, Main Mini App, back navigation and initData verification.

The current local contract is `buildWelcomeMessage()` in `apps/bot/src/bot.ts`. `TELEGRAM_MOCK_ENABLED=true` is the only supported local mode. Real Telegram delivery is intentionally blocked until the deployment owner supplies a bot token, HTTPS origin and webhook authorization. No Telegram API call is made by the local process.
