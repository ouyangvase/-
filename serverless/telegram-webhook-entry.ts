import type { IncomingMessage, ServerResponse } from "node:http";
import { safeEqualText } from "../packages/telegram/src/index.js";
import { ApiPersistence } from "../apps/api/src/persistence.js";
import { handleTelegramUpdate, sendBotApi, type TelegramUpdate } from "../apps/bot/src/bot.js";

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") return writeJson(response, 405, { error: "Method not allowed" });
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const received = request.headers["x-telegram-bot-api-secret-token"];
  const receivedSecret = Array.isArray(received) ? received[0] : received;
  if (!expected || !safeEqualText(expected, receivedSecret)) return writeJson(response, 401, { error: "Webhook secret mismatch" });
  if (!process.env.TELEGRAM_BOT_TOKEN) return writeJson(response, 503, { error: "Telegram bot token is not configured" });

  try {
    const update = await readJson(request);
    const updateId = Number(update.update_id);
    if (!Number.isSafeInteger(updateId) || updateId < 0) return writeJson(response, 400, { error: "Telegram update_id is required" });
    const updateType = update.message ? "message" : update.callback_query ? "callback_query" : update.my_chat_member ? "my_chat_member" : "unknown";
    if (updateType === "unknown") return writeJson(response, 200, { ok: true, ignored: true, updateId });

    const persistence = new ApiPersistence();
    const inserted = await persistence.enqueueTelegramUpdate(updateId, updateType, update);
    const stored = inserted ? { payload: update, published: false } : await persistence.getTelegramUpdate(updateId);
    if (!stored) return writeJson(response, 200, { ok: true, duplicate: true, updateId });
    if (stored.published) return writeJson(response, 200, { ok: true, duplicate: true, updateId });
    const reply = handleTelegramUpdate(stored.payload as TelegramUpdate);
    if (reply) await sendBotApi("sendMessage", reply as unknown as Record<string, unknown>);
    await persistence.markTelegramUpdatePublished(updateId);
    return writeJson(response, 200, { ok: true, accepted: true, updateId, updateType, replied: Boolean(reply), retried: !inserted });
  } catch (error) {
    return writeJson(response, 400, { error: error instanceof Error ? error.message : "Webhook failed" });
  }
}
