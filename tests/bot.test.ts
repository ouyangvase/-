import { describe, expect, it } from "vitest";
import { buildMiniAppDeepLink, buildStartDeepLink, buildWelcomeMessage, handleMockUpdate, handleTelegramUpdate } from "../apps/bot/src/bot";

describe("Telegram bot adapter", () => {
  it("builds a welcome message with a Web App launch button", () => {
    const message = buildWelcomeMessage(123, "ref_DEMO");
    expect(message.text).toBe("欢迎来到 PROJECT 12\n\n点击下方按钮进入游戏大厅。");
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
});
