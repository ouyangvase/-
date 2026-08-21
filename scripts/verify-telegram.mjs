import { loadEnvFile } from "./load-env-file.mjs";

loadEnvFile();

const token = process.env.TELEGRAM_BOT_TOKEN;
const expectedWebhook = process.env.TELEGRAM_WEBHOOK_URL;
const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL;
const expectedUsername = (process.env.TELEGRAM_BOT_USERNAME ?? process.env.BOT_USERNAME ?? "").replace(/^@/, "");
const expectedCommands = ["start", "open", "wallet", "chat", "verification", "support", "language"];

if (!token || !expectedWebhook || !miniAppUrl) {
  throw new Error("TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_URL and TELEGRAM_MINI_APP_URL are required");
}

async function telegram(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`${method} failed: ${result.description ?? response.status}`);
  return result.result;
}

const [me, webhook, menu, commands] = await Promise.all([
  telegram("getMe"),
  telegram("getWebhookInfo"),
  telegram("getChatMenuButton"),
  telegram("getMyCommands")
]);
const username = me.username ?? "";
const menuUrl = menu?.menu_button?.web_app?.url ?? "";
const commandNames = Array.isArray(commands) ? commands.map((command) => command.command) : [];
const result = {
  ok: username.length > 0 && (!expectedUsername || expectedUsername === username) && webhook.url === expectedWebhook && menuUrl === miniAppUrl && expectedCommands.every((command) => commandNames.includes(command)),
  bot: { id: me.id, username },
  webhook: { configured: Boolean(webhook.url), matchesExpected: webhook.url === expectedWebhook, pendingUpdates: webhook.pending_update_count ?? 0, lastError: webhook.last_error_message ?? null },
  menu: { type: menu?.menu_button?.type ?? null, url: menuUrl, matchesMiniApp: menuUrl === miniAppUrl },
  commands: { configured: commandNames, allExpectedPresent: expectedCommands.every((command) => commandNames.includes(command)) },
  miniAppUrl
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
