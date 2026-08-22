import { expect, test } from "@playwright/test";

test("player can open the internal chat and account surfaces", async ({ page }) => {
  await page.route("**/api/auth/telegram", async (route) => {
    const request = route.request();
    const payload = JSON.parse(request.postData() ?? "{}");
    await route.continue({
      headers: { ...request.headers(), "content-type": "application/json" },
      postData: JSON.stringify({ ...payload, demoUser: "demo-player-01" })
    });
  });
  await page.route("**/api/verification/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "APPROVED", canUseChat: true, canUseWallet: true })
  }));
  await page.addInitScript(() => localStorage.setItem("project12_onboarded", "1"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "游戏大厅" })).toBeVisible();
  await page.getByRole("button", { name: /进入游戏聊天室：12牛牛/ }).click();
  await expect(page.locator("[data-chat-inbox]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "我的聊天" })).toBeVisible();
  await expect(page.locator("main.app-shell-chat")).toHaveCSS("padding-left", "0px");
  const inboxShell = await page.locator("main.app-shell-chat").evaluate((element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
  expect(inboxShell.width).toBeLessThanOrEqual(480);
  expect(inboxShell.height).toBeGreaterThan(0);
  await page.getByRole("button", { name: /进入游戏聊天室：12牛牛/ }).click();
  await expect(page.locator(".chat-room-screen")).toBeVisible();
  await expect(page.locator("main.app-shell-room")).toHaveCSS("padding-left", "0px");
  await expect(page.getByRole("heading", { name: /十二牛牛游戏群 2/ })).toBeVisible();
  await expect(page.locator(".chat-pinned-bar")).toContainText("置顶消息（4）");
  await expect(page.getByRole("textbox", { name: "我的聊天" })).toBeVisible();
  await expect(page.locator(".chat-stage-status")).toContainText("抢庄阶段");
  await expect(page.locator(".chat-composer-v2")).toBeVisible();
  await expect(page.locator(".bottom-nav")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "返回" })).toHaveCount(0);
  await expect(page.locator(".chat-command-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "100", exact: true })).toHaveCount(0);
  for (const route of ["/game/12", "/rooms/room-12", "/rounds/R-0247"]) {
    await page.evaluate((nextRoute) => { window.history.pushState({}, "", nextRoute); window.dispatchEvent(new PopStateEvent("popstate")); }, route);
    await expect(page.locator('[data-chat-mode="text-only"]')).toBeVisible();
    await expect(page.locator('[data-game-input="chat-text-only"]')).toBeVisible();
    await expect(page.locator('[data-chat-command-input="true"]')).toBeVisible();
    await expect(page.locator(".chat-command-row")).toHaveCount(0);
  }
  await page.getByRole("textbox", { name: "我的聊天" }).fill("抢庄 600");
  await page.getByRole("textbox", { name: "我的聊天" }).press("Enter");
  await expect(page.locator(".chat-message-row").filter({ hasText: "抢庄 600" }).last()).toContainText("抢庄 600");
  await page.getByRole("textbox", { name: "我的聊天" }).fill("大家好，等这一局开始。");
  await page.getByRole("textbox", { name: "我的聊天" }).press("Enter");
  await expect(page.locator(".chat-message-row").filter({ hasText: "大家好，等这一局开始。" }).last()).toContainText("大家好，等这一局开始。");
  await expect(page.locator(".chat-command-row")).toHaveCount(0);
  await page.evaluate(() => { window.history.replaceState({}, "", "/chat"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await expect(page.locator("[data-chat-inbox]")).toBeVisible();
  await page.getByRole("button", { name: "钱包", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的钱包" })).toBeVisible();
  await page.getByRole("button", { name: "我", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的账号" })).toBeVisible();
  await page.getByRole("button", { name: /可验证资金明细/ }).click();
  await expect(page.getByText("资金明细", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "我", exact: true }).click();
  await page.getByRole("button", { name: /私域关系网络/ }).click();
  await page.getByPlaceholder("邀请码 / UID").fill("DEMO-INVITE");
  await page.getByRole("button", { name: /下一步/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "确认绑定" }).click();
  await expect(page.getByRole("status")).toContainText("邀请关系已记录");
 await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "我的账号" }).click();
  await page.getByRole("button", { name: "积分排行榜" }).click();
  await expect(page.getByRole("heading", { name: "积分排行榜" })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "我的账号" }).click();
  await page.getByRole("button", { name: "每日奖励" }).click();
  await expect(page.getByRole("heading", { name: "每日奖励" })).toBeVisible();
});

test("Telegram runtime cannot silently continue when the API is unavailable", async ({ page }) => {
  await page.route("**/api/auth/telegram", async (route) => {
    const request = route.request();
    const payload = JSON.parse(request.postData() ?? "{}");
    await route.continue({
      headers: { ...request.headers(), "content-type": "application/json" },
      postData: JSON.stringify({ ...payload, demoUser: "telegram-runtime-test" })
    });
  });
  await page.route("**/api/onboarding/device-bind", (route) => route.abort());
  await page.addInitScript(() => {
    (window as unknown as { Telegram: { WebApp: { initData: string; BackButton: { show: () => void; hide: () => void; onClick: () => void; offClick: () => void } } } }).Telegram = { WebApp: { initData: "signed-init-data-placeholder", BackButton: { show: () => undefined, hide: () => undefined, onClick: () => undefined, offClick: () => undefined } } };
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "绑定安全设备" })).toBeVisible();
  await expect(page.getByText("当前客户端没有 SecureStorage")).toBeVisible();
  await expect(page.getByRole("button", { name: "返回" })).toHaveCount(0);
  await page.getByRole("button", { name: /绑定本设备/ }).click();
  await expect(page.getByRole("heading", { name: "绑定安全设备" })).toBeVisible();
  await expect(page.getByText("设备绑定失败")).toBeVisible();
});
