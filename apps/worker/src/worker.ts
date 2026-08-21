import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildPrivatePacketNotification, buildVerificationApprovedNotification, handleTelegramUpdate, sendBotApi, type TelegramUpdate } from "@project12/bot";
import { Project12Database, type QueryExecutor } from "@project12/database";
import { resolveLocale } from "@project12/i18n";
import { createTelegramLaunchToken, telegramLaunchTokenHash } from "../../../packages/telegram/src/index.js";
import { advanceExpiredRounds } from "./round-advancer.js";

type DemoRoundState = "LOBBY" | "BANKER_BIDDING" | "BETTING" | "WAITING_BANKER_CONFIRM" | "PACKET_SENT" | "CLAIMING" | "EVALUATING" | "SETTLING" | "ROUND_COMPLETE" | "ROUND_CANCELLED" | "REFUNDING" | "REFUNDED" | "DISPUTED";

const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1000);
const heartbeatIntervalMs = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 15_000);
const appMode = process.env.APP_MODE ?? "demo";
const database = new Project12Database();
const workerId = `${process.env.HOSTNAME ?? "local"}-${randomBytes(6).toString("hex")}`;
const locks = new Set<string>();
const demoRounds = new Map<string, DemoRoundState>([["R-0247", "BETTING"]]);

export type OutboxEvent = { id: string; type: string; payload: Record<string, unknown>; publishedAt?: string };
export function claimUnpublishedOutbox(events: OutboxEvent[], limit = 100): OutboxEvent[] {
  const claimed = events.filter((event) => !event.publishedAt).slice(0, limit);
  const publishedAt = new Date().toISOString();
  for (const event of claimed) event.publishedAt = publishedAt;
  return claimed;
}

export function withAdvisoryLock<T>(key: string, work: () => T): T | undefined {
  if (locks.has(key)) return undefined;
  locks.add(key);
  try { return work(); } finally { locks.delete(key); }
}

export function advanceDemoRound(roundId: string, target: DemoRoundState): DemoRoundState | undefined {
  return withAdvisoryLock(`round:${roundId}`, () => {
    const current = demoRounds.get(roundId);
    if (!current) return undefined;
    const order: DemoRoundState[] = ["LOBBY", "BANKER_BIDDING", "BETTING", "WAITING_BANKER_CONFIRM", "PACKET_SENT", "CLAIMING", "EVALUATING", "SETTLING", "ROUND_COMPLETE"];
    if (order.indexOf(target) < order.indexOf(current)) return current;
    demoRounds.set(roundId, target);
    return target;
  });
}

type OutboxRow = { id: string; event_type: string; payload: Record<string, unknown> };

function isLaunchCommand(update: TelegramUpdate): boolean {
  const command = update.message?.text?.trim().split(/\s+/, 1)[0]?.split("@", 1)[0];
  return command === "/start" || command === "/open" || command === "/play";
}

async function prepareLaunchToken(updateId: number, update: TelegramUpdate): Promise<string | undefined> {
  const telegramUserId = update.message?.from?.id;
  const chatId = update.message?.chat?.id;
  if (!isLaunchCommand(update) || telegramUserId === undefined || chatId === undefined) return undefined;
  const expiresAtSeconds = (Math.floor(Date.now() / 300_000) + 1) * 300;
  const token = createTelegramLaunchToken(updateId, String(telegramUserId), expiresAtSeconds * 1000);
  if (database.configured) {
    await database.query(`INSERT INTO telegram_launch_grants (update_id, telegram_user_id, chat_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (update_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at
      WHERE telegram_launch_grants.used_at IS NULL`, [updateId, String(telegramUserId), String(chatId), telegramLaunchTokenHash(token), new Date(expiresAtSeconds * 1000)]);
  }
  return token;
}

async function claimDatabaseOutbox(limit = 50): Promise<OutboxRow[]> {
  if (!database.configured) return [];
  return database.transaction(async (client: QueryExecutor) => {
    const rows = await client.query<OutboxRow>("SELECT id, event_type, payload FROM outbox_events WHERE published_at IS NULL AND (claimed_at IS NULL OR claimed_at < now() - interval '60 seconds') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1", [limit]);
    for (const row of rows.rows) await client.query("UPDATE outbox_events SET claimed_at = now(), claimed_by = $2, attempt_count = attempt_count + 1 WHERE id = $1", [row.id, workerId]);
    return rows.rows;
  });
}

async function publishDatabaseOutbox(row: OutboxRow): Promise<void> {
  if (row.event_type === "TELEGRAM_UPDATE_RECEIVED") {
    const update = row.payload.update as TelegramUpdate | undefined;
    const updateId = Number(row.payload.updateId);
    const launchToken = update && Number.isFinite(updateId) ? await prepareLaunchToken(updateId, update) : undefined;
    const response = update ? handleTelegramUpdate(update, { launchToken }) : null;
    if (response) {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        if (appMode !== "demo") throw new Error("AUTHORIZATION_REQUIRED: TELEGRAM_BOT_TOKEN is not configured");
      } else {
        await sendBotApi("sendMessage", response as unknown as Record<string, unknown>);
      }
    }
  }
  if (row.event_type === "IDENTITY_VERIFICATION_APPROVED") {
    const telegramUserId = String(row.payload.telegramUserId ?? "");
    const locale = resolveLocale(String(row.payload.locale ?? ""), undefined, "zh-CN");
    if (telegramUserId) {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        if (appMode !== "demo") throw new Error("AUTHORIZATION_REQUIRED: TELEGRAM_BOT_TOKEN is not configured");
      } else await sendBotApi("sendMessage", buildVerificationApprovedNotification(telegramUserId, locale) as unknown as Record<string, unknown>);
    }
  }
  if (row.event_type === "ROUND_PACKET_AVAILABLE") {
    const recipients = Array.isArray(row.payload.recipients) ? row.payload.recipients.map(String) : [];
    const roundId = String(row.payload.roundId ?? "");
    const packetId = String(row.payload.packetId ?? "");
    const amount = Number(row.payload.amount ?? 0);
    const locale = resolveLocale(String(row.payload.locale ?? ""), undefined, "zh-CN");
    for (const telegramUserId of recipients) {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        if (appMode !== "demo") throw new Error("AUTHORIZATION_REQUIRED: TELEGRAM_BOT_TOKEN is not configured");
      } else await sendBotApi("sendMessage", buildPrivatePacketNotification(telegramUserId, roundId, packetId, amount, locale) as unknown as Record<string, unknown>);
    }
  }
  if (row.event_type === "INTERNAL_CHAT_MESSAGE") {
    // Internal chat is delivered by the API/Supabase Realtime. Never mirror it
    // into a Telegram native group; the bot is only for private notifications.
  }
  if (row.event_type === "TELEGRAM_GROUP_ROOM_MESSAGE") {
    // Deliberately ignored: the game authority is the Mini App internal chat,
    // never a Telegram native group.
  }
  await database.query("UPDATE outbox_events SET published_at = now(), claimed_at = NULL, claimed_by = NULL, last_error = NULL WHERE id = $1", [row.id]);
}

async function failDatabaseOutbox(row: OutboxRow, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Worker outbox delivery failed";
  await database.query("UPDATE outbox_events SET claimed_at = NULL, claimed_by = NULL, last_error = $2 WHERE id = $1", [row.id, message.slice(0, 500)]);
}

async function writeHeartbeat(): Promise<void> {
  if (!database.configured) {
    if (appMode !== "demo") throw new Error("DATABASE_REQUIRED: Worker heartbeat requires persistent storage");
    return;
  }
  await database.query("INSERT INTO worker_heartbeats (worker_id, status, heartbeat_at) VALUES ($1, 'healthy', now()) ON CONFLICT (worker_id) DO UPDATE SET status = 'healthy', heartbeat_at = now()", [workerId]);
}

async function pollOutbox(): Promise<void> {
  for (const row of await claimDatabaseOutbox()) {
    try { await publishDatabaseOutbox(row); }
    catch (error) { await failDatabaseOutbox(row, error); console.error(JSON.stringify({ service: "worker", action: "outbox_delivery_failed", outbox_id: row.id, error: error instanceof Error ? error.message : "unknown" })); }
  }
}

async function pollRounds(): Promise<void> {
  const advanced = await advanceExpiredRounds(database, workerId);
  if (advanced > 0) console.log(JSON.stringify({ service: "worker", action: "rounds_advanced", count: advanced, worker_id: workerId }));
}

export async function startWorker(): Promise<void> {
  if (appMode !== "demo" && !database.configured) throw new Error("DATABASE_REQUIRED: Worker cannot start outside demo without DATABASE_URL");
  await writeHeartbeat();
  await pollRounds();
  console.log(JSON.stringify({ service: "worker", mode: appMode, status: database.configured ? "ready" : "MOCK_ONLY", worker_id: workerId }));
  const heartbeatTimer = setInterval(() => { void writeHeartbeat().catch((error: unknown) => console.error(JSON.stringify({ service: "worker", action: "heartbeat_failed", error: error instanceof Error ? error.message : "unknown" }))); }, heartbeatIntervalMs);
  const pollTimer = setInterval(() => { void Promise.all([pollOutbox(), pollRounds()]).catch((error: unknown) => console.error(JSON.stringify({ service: "worker", action: "poll_failed", error: error instanceof Error ? error.message : "unknown" }))); }, pollIntervalMs);
  const stop = () => { clearInterval(heartbeatTimer); clearInterval(pollTimer); void database.close(); };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startWorker().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
