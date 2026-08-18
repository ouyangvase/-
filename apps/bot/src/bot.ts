type TelegramReplyMarkup = {
  keyboard: Array<Array<{ text: string; web_app: { url: string } }>>;
  resize_keyboard: boolean;
  is_persistent: boolean;
};

export type BotMessage = {
  chat_id: string | number;
  text: string;
  reply_markup: TelegramReplyMarkup;
};

const miniAppUrl = process.env.MINIAPP_ORIGIN ?? "http://localhost:4173";

export const botCommands = ["start", "play", "wallet", "history", "missions", "referral", "rules", "support"] as const;

export function buildWelcomeMessage(chatId: string | number, startParam = ""): BotMessage {
  const suffix = startParam ? `\n\n邀请参数已记录：${startParam}` : "";
  return {
    chat_id: chatId,
    text: `欢迎来到 PROJECT 12\n\n这里是 12牛牛的演示入口。先绑定设备并设置 6 位安全密码，再进入大厅。\n\n当前为 DEMO 模式，积分无现金价值。${suffix}`,
    reply_markup: {
      keyboard: [[{ text: "进入游戏大厅", web_app: { url: miniAppUrl } }]],
      resize_keyboard: true,
      is_persistent: true
    }
  };
}

export function handleMockUpdate(update: { message?: { chat?: { id?: string | number }; text?: string } }): BotMessage | null {
  const message = update.message;
  if (!message?.chat?.id || !message.text?.trim().startsWith("/start")) return null;
  return buildWelcomeMessage(message.chat.id, message.text.trim().split(/\s+/, 2)[1] ?? "");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = handleMockUpdate({ message: { chat: { id: "demo-chat" }, text: "/start demo-ref" } });
  console.log(JSON.stringify({ service: "bot", mode: process.env.APP_MODE ?? "demo", status: "MOCK_ONLY", commands: botCommands, sampleStartResponse: sample }, null, 2));
}
