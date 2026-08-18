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

const miniAppUrl = process.env.MINIAPP_ORIGIN ?? "http://localhost:4173";
const botUsername = process.env.BOT_USERNAME ?? "project12_demo_bot";

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
  return `https://t.me/${botUsername}?startapp=${referralCode ? `ref_${encodeURIComponent(referralCode)}` : "hall"}`;
}

export function buildReplyKeyboard(): TelegramReplyMarkup {
  return {
    keyboard: [[{ text: "进入游戏大厅", web_app: { url: miniAppUrl } }]],
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
  const suffix = startParam ? `\n\n邀请参数已记录：${startParam}` : "";
  return {
    chat_id: chatId,
    text: `欢迎来到 PROJECT 12\n\n这里是 12牛牛的演示入口。先绑定设备并设置 6 位安全密码，再进入大厅。\n\n当前为 DEMO 模式，积分无现金价值。${suffix}`,
    reply_markup: buildReplyKeyboard()
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sample = handleMockUpdate({ message: { chat: { id: "demo-chat" }, text: "/start ref_P12-DEMO-01" } });
  console.log(JSON.stringify({ service: "bot", mode: process.env.APP_MODE ?? "demo", status: "MOCK_ONLY", commands: botCommands, menuButton: buildMenuButtonConfig(), mainMiniApp: buildMainMiniAppConfig(), sampleStartResponse: sample }, null, 2));
}
