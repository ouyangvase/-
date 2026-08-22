import { describe, expect, it } from "vitest";
import { botCommands, buildMiniAppDeepLink, buildPrivatePacketNotification, buildStartDeepLink, buildVerificationApprovedNotification, buildWelcomeMessage, handleMockUpdate, handleTelegramUpdate } from "../apps/bot/src/bot";

describe("Telegram bot adapter", () => {
  it("builds a welcome message with a Web App launch button", () => {
    const message = buildWelcomeMessage(123, "ref_DEMO");
    expect(message.text).toBe("欢迎来到 12牛牛\n\n点击下方按钮打开小程序进入游戏大厅。");
    expect(message.reply_markup.keyboard[0][0].text).toBe("进入游戏大厅");
    expect(message.reply_markup.keyboard[0][0].web_app.url).toBe("http://localhost:4173?startapp=ref_DEMO");
  });

  it("ignores non-start updates in mock mode", () => {
    expect(handleMockUpdate({ message: { chat: { id: 1 }, text: "hello" } })).toBeNull();
  });

  it("supports both Bot start and Mini App startapp referral links", () => {
    expect(buildStartDeepLink("1163699415")).toContain("?start=ref_1163699415");
    expect(buildMiniAppDeepLink("1163699415")).toContain("?startapp=ref_1163699415");
    expect(handleTelegramUpdate({ message: { chat: { id: 1 }, text: "/start ref_1163699415" } })).not.toBeNull();
  });

  it("processes callback queries and Mini App data updates", () => {
    expect(handleTelegramUpdate({ callback_query: { id: "callback-1", data: "open:hall", message: { chat: { id: 1 } } } })).toMatchObject({ chat_id: 1 });
    expect(handleTelegramUpdate({ message: { chat: { id: 1 }, web_app_data: { data: JSON.stringify({ action: "open" }) } } })).toMatchObject({ chat_id: 1 });
  });

  it("publishes the canonical Telegram command contract", () => {
    expect(botCommands.map((command) => command.command)).toEqual(["start", "open", "wallet", "chat", "verification", "support", "language"]);
  });

  it("builds private approval and bettor-only packet notifications", () => {
    const approval = buildVerificationApprovedNotification(1163699415);
    expect(approval.text).toContain("实名认证已通过");
    expect(approval.reply_markup?.inline_keyboard[0][0].web_app?.url).toContain("startapp=hall");
    const packet = buildPrivatePacketNotification(1163699415, "R-0247", "packet-1", 250);
    expect(packet.text).toContain("只发送给本局已下注玩家");
    expect(packet.reply_markup?.inline_keyboard[0][0].web_app?.url).toContain("claim_round=R-0247");
  });
});
