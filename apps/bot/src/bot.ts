import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

type WebAppButton = { text: string; web_app: { url: string } };
type InlineButton = { text: string; web_app?: { url: string }; callback_data?: string };

export type TelegramReplyMarkup = {
  keyboard: Array<Array<WebAppButton>>;
  resize_keyboard: boolean;
  is_persistent: boolean;
};

export type BotMessage = {
  chat_id: string | number;
  text: string;
  reply_markup: TelegramReplyMarkup;
};

export type BotCommand = { command: string; description: string };
export type MenuButtonConfig = { type: "web_app"; text: string; web_app: { url: string } };
export type MainMiniAppConfig = { type: "web_app"; text: string; web_app: { url: string } };
export type NotificationPayload = { chat_id: string | number; text: string; disable_web_page_preview: true };
export type TelegramUpdate = { message?: { chat?: { id?: string | number }; text?: string } };

const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL ?? process.env.MINIAPP_ORIGIN ?? "http://localhost:4173";
const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? process.env.BOT_USERNAME ?? "project12_demo_bot";

export const botCommands: BotCommand[] = [
  { command: "start", description: "打开 PROJECT 12" },
  { command: "play", description: "进入游戏大厅" },
  { command: "wallet", description: "查看模拟积分" },
  { command: "history", description: "查看回合记录" },
  { command: "missions", description: "查看任务奖励" },
  { command: "referral", description: "查看邀请关系" },
  { command: "rules", description: "查看 12牛牛规则" },
  { command: "support", description: "联系支持" }
];

export function buildStartDeepLink(referralCode?: string): string {
  return `https://t.me/${botUsername}?start=${referralCode ? `ref_${encodeURIComponent(referralCode)}` : "hall"}`;
}

export function buildMiniAppDeepLink(referralCode?: string): string {
  return `https://t.me/${botUsername}?startapp=${referralCode ? `ref_${encodeURIComponent(referralCode)}` : "hall"}`;
}

export function buildReplyKeyboard(startParam = ""): TelegramReplyMarkup {
  const referral = startParam.startsWith("ref_") ? `${miniAppUrl}${miniAppUrl.includes("?") ? "&" : "?"}startapp=${encodeURIComponent(startParam)}` : miniAppUrl;
  return {
    keyboard: [[{ text: "进入游戏大厅", web_app: { url: referral } }]],
    resize_keyboard: true,
    is_persistent: true
  };
}

export function buildMenuButtonConfig(): MenuButtonConfig {
  return { type: "web_app", text: "进入 PROJECT 12", web_app: { url: miniAppUrl } };
}

export function buildMainMiniAppConfig(): MainMiniAppConfig {
  return { type: "web_app", text: "打开 12牛牛", web_app: { url: miniAppUrl } };
}

export function buildWelcomeMessage(chatId: string | number, startParam = ""): BotMessage {
  return {
    chat_id: chatId,
    text: "欢迎来到 PROJECT 12\n\n点击下方按钮进入游戏大厅。",
    reply_markup: buildReplyKeyboard(startParam)
  };
}

export function buildRoundNotification(chatId: string | number, roundId: string, text: string): NotificationPayload {
  return { chat_id: chatId, text: `PROJECT 12 · ${roundId}\n${text}\n\n仅限 Demo 积分，无现金价值。`, disable_web_page_preview: true };
}

export function buildCommandMessage(chatId: string | number, command: string, startParam = ""): BotMessage | NotificationPayload {
  if (command === "/start" || command === "/play") return buildWelcomeMessage(chatId, startParam);
  const labels: Record<string, string> = {
    "/wallet": "钱包页面会展示可用、冻结和不可提现的 Demo 积分。",
    "/history": "回合历史以服务器事件和账本 Reference ID 为准。",
    "/missions": "任务奖励仅进入 Demo 账户，不能兑换现金。",
    "/referral": "邀请关系需要在 Mini App 内二次确认，绑定后不可自行更换。",
    "/rules": "先确认规则版本和牌型示例，再进入游戏。",
    "/support": "客服入口需要由部署者配置 support username。"
  };
  return buildRoundNotification(chatId, "BOT", labels[command] ?? "请使用 /start 打开 Mini App。");
}

export async function sendBotApi(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("AUTHORIZATION_REQUIRED: TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !result.ok) throw new Error(result.description ?? `Telegram API ${method} failed`);
  return result;
}

export async function configureBot(): Promise<void> {
  await sendBotApi("setMyCommands", { commands: botCommands });
  await sendBotApi("setChatMenuButton", { menu_button: buildMenuButtonConfig() });
}

export function handleMockUpdate(update: { message?: { chat?: { id?: string | number }; text?: string } }): BotMessage | NotificationPayload | null {
  const message = update.message;
  if (!message?.chat?.id || !message.text?.trim().startsWith("/")) return null;
  const [command, startParam = ""] = message.text.trim().split(/\s+/, 2);
  return buildCommandMessage(message.chat.id, command, startParam);
}

export function handleTelegramUpdate(update: TelegramUpdate): BotMessage | NotificationPayload | null {
  return handleMockUpdate(update);
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readBody(request: IncomingMessage): Promise<TelegramUpdate> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => data += chunk);
    request.on("end", () => {
      try { resolve(data ? JSON.parse(data) as TelegramUpdate : {}); } catch { reject(new Error("Invalid Telegram update")); }
    });
    request.on("error", reject);
  });
}

async function processUpdate(update: TelegramUpdate): Promise<{ handled: boolean; mock: boolean }> {
  const payload = handleTelegramUpdate(update);
  if (!payload) return { handled: false, mock: !process.env.TELEGRAM_BOT_TOKEN };
  if (!process.env.TELEGRAM_BOT_TOKEN) return { handled: true, mock: true };
  await sendBotApi("sendMessage", payload as unknown as Record<string, unknown>);
  return { handled: true, mock: false };
}

async function configureWebhook(): Promise<void> {
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (!webhookUrl || !process.env.TELEGRAM_BOT_TOKEN) return;
  await sendBotApi("setWebhook", {
    url: webhookUrl,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"]
  });
}

async function startBotService(): Promise<void> {
  const port = Number(process.env.BOT_PORT ?? 8790);
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "GET" && url.pathname === "/health") return writeJson(response, 200, { ok: true, mode: process.env.APP_MODE ?? "demo", tokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN), webhookConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_URL) });
      if (request.method === "POST" && url.pathname === "/telegram/webhook") {
        if (secret && request.headers["x-telegram-bot-api-secret-token"] !== secret) return writeJson(response, 401, { error: "Webhook secret mismatch" });
        const result = await processUpdate(await readBody(request));
        return writeJson(response, 200, { ok: true, ...result });
      }
      return writeJson(response, 404, { error: "Not found" });
    } catch (error) {
      return writeJson(response, 400, { error: error instanceof Error ? error.message : "Bot request failed" });
    }
  });
  server.listen(port, "0.0.0.0", () => console.log(`PROJECT 12 Bot service listening on ${port}`));
  if (process.env.TELEGRAM_BOT_TOKEN) {
    await configureBot();
    await configureWebhook();
  } else {
    console.log(JSON.stringify({ service: "bot", mode: process.env.APP_MODE ?? "demo", status: "MOCK_ONLY", commands: botCommands, menuButton: buildMenuButtonConfig(), mainMiniApp: buildMainMiniAppConfig(), sampleStartResponse: handleMockUpdate({ message: { chat: { id: "demo-chat" }, text: "/start ref_P12-DEMO-01" } }) }, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startBotService().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
