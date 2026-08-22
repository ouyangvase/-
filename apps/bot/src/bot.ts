import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { createTranslator, resolveLocale, type Locale } from "@project12/i18n";
import { safeEqualText } from "../../../packages/telegram/src/index.js";

type WebAppButton = { text: string; web_app: { url: string } };
type InlineButton = { text: string; web_app?: { url: string }; callback_data?: string };
type InlineKeyboardMarkup = { inline_keyboard: Array<Array<InlineButton>> };

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
export type NotificationPayload = { chat_id: string | number; text: string; disable_web_page_preview: true; reply_markup?: InlineKeyboardMarkup };
export type TelegramMessage = { chat?: { id?: string | number }; from?: { id?: string | number; username?: string; language_code?: string }; text?: string; web_app_data?: { data?: string; button_text?: string } };
export type TelegramCallbackQuery = { id?: string; from?: { id?: string | number; language_code?: string }; message?: TelegramMessage; data?: string };
export type TelegramUpdate = { update_id?: number; message?: TelegramMessage; callback_query?: TelegramCallbackQuery };

const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL ?? process.env.MINIAPP_ORIGIN ?? "http://localhost:4173";
const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? process.env.BOT_USERNAME ?? "project12_demo_bot";

export const botCommands: BotCommand[] = [
  { command: "start", description: "打开 12牛牛" },
  { command: "open", description: "进入游戏大厅" },
  { command: "wallet", description: "查看钱包" },
  { command: "chat", description: "打开游戏聊天室" },
  { command: "verification", description: "查看实名认证" },
  { command: "support", description: "联系支持" },
  { command: "language", description: "选择语言" }
];

export function buildStartDeepLink(referralCode?: string): string {
  return `https://t.me/${botUsername}?start=${referralCode ? `ref_${encodeURIComponent(referralCode)}` : "hall"}`;
}

export function buildMiniAppDeepLink(referralCode?: string): string {
  return `https://t.me/${botUsername}?startapp=${referralCode ? `ref_${encodeURIComponent(referralCode)}` : "hall"}`;
}

function defaultLocale(): Locale {
  return resolveLocale(process.env.TELEGRAM_DEFAULT_LOCALE, undefined, "zh-CN");
}

export function buildReplyKeyboard(startParam = "", launchToken?: string, locale = defaultLocale()): TelegramReplyMarkup {
  const referralUrl = new URL(miniAppUrl);
  if (startParam.startsWith("ref_")) referralUrl.searchParams.set("startapp", startParam);
  if (launchToken) referralUrl.searchParams.set("launch_token", launchToken);
  const webAppUrl = referralUrl.toString().replace(/\/(?=\?|$)/, "");
  return {
    keyboard: [[{ text: createTranslator(locale)("bot.open"), web_app: { url: webAppUrl } }]],
    resize_keyboard: true,
    is_persistent: true
  };
}

export function buildMenuButtonConfig(locale = defaultLocale()): MenuButtonConfig {
  return { type: "web_app", text: createTranslator(locale)("bot.open"), web_app: { url: miniAppUrl } };
}

export function buildMainMiniAppConfig(locale = defaultLocale()): MainMiniAppConfig {
  return { type: "web_app", text: createTranslator(locale)("bot.open"), web_app: { url: miniAppUrl } };
}

export function buildWelcomeMessage(chatId: string | number, startParam = "", launchToken?: string, locale = defaultLocale()): BotMessage {
  const t = createTranslator(locale);
  return {
    chat_id: chatId,
    text: t("bot.welcome"),
    reply_markup: buildReplyKeyboard(startParam, launchToken, locale)
  };
}

export function buildRoundNotification(chatId: string | number, roundId: string, text: string, locale = defaultLocale()): NotificationPayload {
  const disclaimer = locale === "zh-CN" ? "仅限 Demo 积分，无现金价值。" : "Demo credits only; no cash value.";
  return { chat_id: chatId, text: `PROJECT 12 · ${roundId}\n${text}\n\n${disclaimer}`, disable_web_page_preview: true };
}

function buildMiniAppUrl(params: Record<string, string>): string {
  const url = new URL(miniAppUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

export function buildVerificationApprovedNotification(chatId: string | number, locale = defaultLocale()): NotificationPayload {
  const t = createTranslator(locale);
  return {
    chat_id: chatId,
    text: `✅ ${t("bot.verificationApproved")}\n\n${locale === "zh-CN" ? "请重新打开小程序，或点击右上角重新加载页面即可。" : "Reopen the Mini App or reload it from the top-right menu."}`,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: t("bot.open"), web_app: { url: buildMiniAppUrl({ startapp: "hall" }) } }]] }
  };
}

export function buildPrivatePacketNotification(chatId: string | number, roundId: string, packetId: string, amount: number, locale = defaultLocale()): NotificationPayload {
  const isChinese = locale === "zh-CN";
  return {
    chat_id: chatId,
    text: isChinese
      ? `🧧 平台红包已发出\n回合 ${roundId}\n${amount} PT 内部积分已准备，请在有效时间内领取。\n\n这条消息只发送给本局已下注玩家。旁观者不会收到领取入口。\n仅限 Demo 积分，无现金价值。`
      : `🧧 The internal packet is ready\nRound ${roundId}\n${amount} PT is ready to claim before it expires.\n\nThis message is sent only to players who bet in this round. Spectators do not receive a claim entry.\nDemo credits only; no cash value.`,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: isChinese ? "打开平台红包" : "Open internal packet", web_app: { url: buildMiniAppUrl({ claim_round: roundId, packet: packetId }) } }]] }
  };
}

export function buildCommandMessage(chatId: string | number, command: string, startParam = "", launchToken?: string, locale = defaultLocale()): BotMessage | NotificationPayload {
  const t = createTranslator(locale);
  if (command === "/start" || command === "/open" || command === "/play") return buildWelcomeMessage(chatId, startParam, launchToken, locale);
  const labels: Record<string, string> = {
    "/wallet": t("bot.wallet"),
    "/chat": t("bot.chat"),
    "/verification": t("bot.verification"),
    "/language": t("bot.language"),
    "/support": t("bot.support"),
    "/history": t("bot.history"),
    "/missions": t("bot.missions"),
    "/referral": t("bot.referral"),
    "/rules": t("bot.rules")
  };
  return buildRoundNotification(chatId, "BOT", labels[command] ?? t("bot.fallback"), locale);
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

export function handleMockUpdate(update: { message?: { chat?: { id?: string | number }; from?: { language_code?: string }; text?: string } }, launchToken?: string, locale?: Locale): BotMessage | NotificationPayload | null {
  const message = update.message;
  if (!message?.chat?.id || !message.text?.trim().startsWith("/")) return null;
  const [command, startParam = ""] = message.text.trim().split(/\s+/, 2);
  return buildCommandMessage(message.chat.id, command, startParam, launchToken, locale ?? resolveLocale(undefined, update.message?.from?.language_code, defaultLocale()));
}

function handleCallbackQuery(update: TelegramUpdate): BotMessage | NotificationPayload | null {
  const callback = update.callback_query;
  const chatId = callback?.message?.chat?.id;
  if (chatId === undefined) return null;
  const locale = resolveLocale(undefined, callback?.from?.language_code, defaultLocale());
  const data = callback?.data?.trim();
  if (data === "open" || data === "open:hall" || data === "open_hall") return buildWelcomeMessage(chatId, "", undefined, locale);
  return buildRoundNotification(chatId, "BOT", locale === "zh-CN" ? "请在小程序内完成这项操作。" : "Please complete this action inside the Mini App.", locale);
}

export function handleTelegramUpdate(update: TelegramUpdate, options: { launchToken?: string } = {}): BotMessage | NotificationPayload | null {
  if (update.callback_query) return handleCallbackQuery(update);
  if (update.message?.web_app_data?.data?.trim() && update.message.chat?.id !== undefined) {
    const locale = resolveLocale(undefined, update.message.from?.language_code, defaultLocale());
    return buildRoundNotification(update.message.chat.id, "WEB_APP", locale === "zh-CN" ? "已收到小程序操作。" : "Mini App action received.", locale);
  }
  return handleMockUpdate(update, options.launchToken);
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
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    if ((process.env.APP_MODE ?? "demo") !== "demo") throw new Error("AUTHORIZATION_REQUIRED: TELEGRAM_BOT_TOKEN is not configured");
    return { handled: true, mock: true };
  }
  await sendBotApi("sendMessage", payload as unknown as Record<string, unknown>);
  return { handled: true, mock: false };
}

async function configureWebhook(): Promise<void> {
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (!webhookUrl || !process.env.TELEGRAM_BOT_TOKEN) return;
  await sendBotApi("setWebhook", {
    url: webhookUrl,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"]
  });
}

async function startBotService(): Promise<void> {
  const port = Number(process.env.BOT_PORT ?? 8790);
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "GET" && url.pathname === "/health") { const mode = process.env.APP_MODE ?? "demo"; const tokenConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN); const ready = mode === "demo" || tokenConfigured; return writeJson(response, ready ? 200 : 503, { ok: ready, mode, tokenConfigured, webhookConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_URL) }); }
      if (request.method === "POST" && url.pathname === "/telegram/webhook") {
        const receivedSecretHeader = request.headers["x-telegram-bot-api-secret-token"];
        const receivedSecret = Array.isArray(receivedSecretHeader) ? receivedSecretHeader[0] : receivedSecretHeader;
        if ((process.env.APP_MODE ?? "demo") !== "demo" && !secret) return writeJson(response, 503, { code: "WEBHOOK_SECRET_REQUIRED", error: "Telegram webhook secret is not configured" });
        if (secret && !safeEqualText(secret, receivedSecret)) return writeJson(response, 401, { error: "Webhook secret mismatch" });
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
    const mode = process.env.APP_MODE ?? "demo";
    console.log(JSON.stringify(mode === "demo"
      ? { service: "bot", mode, status: "MOCK_ONLY", commands: botCommands, menuButton: buildMenuButtonConfig(), mainMiniApp: buildMainMiniAppConfig(), sampleStartResponse: handleMockUpdate({ message: { chat: { id: "demo-chat" }, text: "/start ref_P12-DEMO-01" } }) }
      : { service: "bot", mode, status: "BLOCKED", reason: "TELEGRAM_BOT_TOKEN_REQUIRED" }, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startBotService().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
