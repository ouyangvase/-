import { loadEnvFile } from "./load-env-file.mjs";
import { Project12Database } from "../packages/database/src/index.js";

loadEnvFile();

const required = [
  "APP_MODE", "TELEGRAM_MOCK_ENABLED", "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME",
  "DATABASE_URL", "DIRECT_URL", "TELEGRAM_WEBHOOK_SECRET", "SESSION_SECRET",
  "TELEGRAM_WEBHOOK_URL", "TELEGRAM_MINI_APP_URL"
];
const expectedCommands = ["start", "open", "wallet", "chat", "verification", "support", "language"];

function normalizedUrl(value: string | undefined): string { return (value ?? "").replace(/\/$/, ""); }

async function telegram(method: string): Promise<{ ok: boolean; result?: any }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`);
    const result = await response.json() as { ok?: boolean; result?: any };
    return { ok: response.ok && result.ok === true, result: result.result };
  } catch {
    return { ok: false };
  }
}

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.log(JSON.stringify({ ok: false, missing }, null, 2));
  process.exitCode = 1;
} else {
  const stagingFlagsValid = process.env.APP_MODE === "staging" && process.env.TELEGRAM_MOCK_ENABLED === "false";
  const database = new Project12Database();
  const databaseStatus = await database.health();
  const [me, webhook, menu, commands] = await Promise.all([
    telegram("getMe"), telegram("getWebhookInfo"), telegram("getChatMenuButton"), telegram("getMyCommands")
  ]);
  const expectedUsername = (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "");
  const commandNames = Array.isArray(commands.result)
    ? commands.result
      .map((command) => (typeof command === "object" && command !== null && "command" in command ? command.command : undefined))
      .filter((command): command is string => typeof command === "string")
    : [];
  let api: { reachable: boolean; status?: number; mode?: string; ready?: boolean } = { reachable: false };
  try {
    const apiOrigin = new URL(process.env.TELEGRAM_WEBHOOK_URL!).origin;
    const response = await fetch(`${apiOrigin}/api/health`);
    const body = await response.json() as { mode?: string; ok?: boolean };
    api = { reachable: response.ok, status: response.status, mode: body.mode, ready: response.ok && body.ok === true };
  } catch { /* report only reachability, never transport details */ }
  await database.close();
  const report = {
    ok: stagingFlagsValid
      && databaseStatus === "healthy"
      && me.ok
      && (me.result?.username ?? "") === expectedUsername
      && webhook.ok
      && normalizedUrl(webhook.result?.url) === normalizedUrl(process.env.TELEGRAM_WEBHOOK_URL)
      && menu.ok
      && normalizedUrl(menu.result?.menu_button?.web_app?.url) === normalizedUrl(process.env.TELEGRAM_MINI_APP_URL)
      && expectedCommands.every((command) => commandNames.includes(command))
      && api.reachable
      && api.ready,
    environment: { appMode: process.env.APP_MODE, telegramMockEnabled: process.env.TELEGRAM_MOCK_ENABLED, stagingFlagsValid, secretsPresent: true },
    database: { status: databaseStatus, migrationSchemaReady: databaseStatus === "healthy" },
    api,
    bot: { configured: me.ok, username: me.result?.username ?? null, usernameMatches: (me.result?.username ?? "") === expectedUsername },
    webhook: { configured: Boolean(webhook.result?.url), matchesExpected: normalizedUrl(webhook.result?.url) === normalizedUrl(process.env.TELEGRAM_WEBHOOK_URL), pendingUpdates: webhook.result?.pending_update_count ?? null, hasLastError: Boolean(webhook.result?.last_error_message) },
    menu: { type: menu.result?.menu_button?.type ?? null, matchesMiniApp: normalizedUrl(menu.result?.menu_button?.web_app?.url) === normalizedUrl(process.env.TELEGRAM_MINI_APP_URL) },
    commands: { configured: commandNames, allExpectedPresent: expectedCommands.every((command) => commandNames.includes(command)) }
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
