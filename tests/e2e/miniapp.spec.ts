import { expect, test } from "@playwright/test";

test("player can complete the safe demo round path", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "新设备登录" })).toBeVisible();
  await page.getByRole("button", { name: /绑定本设备/ }).click();
  await page.getByLabel("邀请人 UID").fill("DEMO-INVITE");
  await page.getByRole("button", { name: /下一步/ }).click();
  await expect(page.getByRole("dialog", { name: "绑定此邀请人？" })).toBeVisible();
  await page.getByRole("button", { name: "确认绑定" }).click();
  await page.getByLabel("设置 6 位数字密码").fill("258036");
  await page.getByLabel("再次确认").fill("258036");
  await page.getByRole("button", { name: /完成安全设置/ }).click();
  await expect(page.getByRole("heading", { name: "游戏大厅" })).toBeVisible();
  await page.getByRole("button", { name: /进入游戏/ }).click();
  await expect(page.getByRole("heading", { name: "R-0247" })).toBeVisible();
  await page.getByRole("button", { name: /确认抢庄/ }).click();
  await page.getByRole("button", { name: /250 DEMO/ }).click();
  await page.getByRole("button", { name: /领取模拟红包/ }).click();
  await page.getByRole("button", { name: /查看并结算/ }).click();
  await expect(page.getByText("已验证结算")).toBeVisible();
  await page.getByRole("button", { name: /返回游戏大厅/ }).click();
  await page.getByRole("button", { name: "我", exact: true }).click();
  await expect(page.getByText("资金明细")).toBeVisible();
  await page.getByRole("button", { name: /推广与邀请/ }).click();
  await page.getByLabel("邀请码 / UID").fill("DEMO-INVITE");
  await page.getByRole("button", { name: /下一步/ }).click();
  await expect(page.getByRole("dialog", { name: "确认绑定邀请人？" })).toBeVisible();
  await page.getByRole("button", { name: "确认绑定" }).click();
  await expect(page.getByRole("status")).toContainText("邀请关系已记录");
});

test("Telegram runtime cannot silently continue when the API is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { Telegram: { WebApp: { initData: string; BackButton: { show: () => void; hide: () => void; onClick: () => void; offClick: () => void } } } }).Telegram = { WebApp: { initData: "signed-init-data-placeholder", BackButton: { show: () => undefined, hide: () => undefined, onClick: () => undefined, offClick: () => undefined } } };
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "新设备登录" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "SecureStorage" })).toBeVisible();
  await expect(page.getByRole("button", { name: "返回" })).toHaveCount(0);
  await page.getByRole("button", { name: /绑定本设备/ }).click();
  await expect(page.getByRole("heading", { name: "新设备登录" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "设备绑定失败" })).toBeVisible();
});
