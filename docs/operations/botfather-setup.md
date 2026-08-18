# Telegram Bot setup

This repository contains a safe, non-sending Bot adapter. It builds the `/start` response and a Telegram Web App button, but it never sends a message without an operator-supplied token and an explicit deployment step.

## BotFather checklist

1. Create a bot in BotFather and keep the token in a secret manager only.
2. Set the display name, username and description from the central brand configuration.
3. Configure the Mini App URL as the HTTPS staging or production origin.
4. Configure the webhook URL and a secret token on the server. Reject requests with a missing or invalid secret.
5. Test `/start`, `/start <referral_code>`, the Web App button, back navigation and initData verification.

The current local contract is `buildWelcomeMessage()` in `apps/bot/src/bot.ts`. `TELEGRAM_MOCK_ENABLED=true` is the only supported local mode. Real Telegram delivery is intentionally blocked until the deployment owner supplies a bot token, HTTPS origin and webhook authorization.
