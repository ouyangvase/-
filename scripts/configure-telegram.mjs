const token = process.env.TELEGRAM_BOT_TOKEN;
const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !miniAppUrl || !webhookUrl || !webhookSecret) {
  throw new Error("TELEGRAM_BOT_TOKEN, TELEGRAM_MINI_APP_URL, TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET are required");
}

const commands = [
  ["start", "打开 12牛牛"],
  ["play", "进入游戏大厅"],
  ["wallet", "查看内部积分"],
  ["history", "查看回合记录"],
  ["missions", "查看任务奖励"],
  ["referral", "查看邀请关系"],
  ["rules", "查看 12牛牛规则"],
  ["support", "联系支持"]
].map(([command, description]) => ({ command, description }));

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`${method} failed: ${result.description ?? response.status}`);
  return result.result;
}

const me = await telegram("getMe", {});
await telegram("setMyCommands", { commands });
await telegram("setChatMenuButton", { menu_button: { type: "web_app", text: "进入游戏大厅", web_app: { url: miniAppUrl } } });
await telegram("setWebhook", { url: webhookUrl, secret_token: webhookSecret, allowed_updates: ["message", "callback_query"] });
console.log(`Telegram configured for @${me.username ?? "bot"}`);
console.log(`Mini App: ${miniAppUrl}`);
console.log(`Webhook: ${webhookUrl}`);
