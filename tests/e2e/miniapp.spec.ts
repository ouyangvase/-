import { expect, test } from "@playwright/test";

test("player can complete the safe demo round path", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "建立你的设备节点" })).toBeVisible();
  await page.getByRole("button", { name: /绑定本设备/ }).click();
  await page.getByLabel("邀请人 UID / 邀请码").fill("DEMO-INVITE");
  await page.getByRole("button", { name: /继续确认/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "确认绑定" }).click();
  await page.getByLabel("安全密码").fill("258036");
  await page.getByLabel("再次输入").fill("258036");
  await page.getByRole("button", { name: /进入大厅/ }).click();
  await expect(page.getByRole("heading", { name: "游戏大厅" })).toBeVisible();
  await page.getByRole("button", { name: /进入游戏聊天室：12牛牛/ }).click();
  await expect(page.getByRole("heading", { name: "当前游戏聊天室" })).toBeVisible();
  await page.getByRole("button", { name: /继续当前回合/ }).click();
  await expect(page.getByRole("heading", { name: "R-0247" })).toBeVisible();
  await page.getByRole("button", { name: /按住确认抢庄/ }).click();
  await page.getByRole("button", { name: /按住锁定下注/ }).click();
  await page.getByRole("button", { name: /打开平台红包/ }).click();
  await page.getByRole("button", { name: /按住查看结算/ }).click();
  await expect(page.getByRole("heading", { name: "WIN" })).toBeVisible();
  await page.getByRole("button", { name: /返回游戏大厅/ }).click();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: /可验证资金明细/ }).click();
  await expect(page.getByText("OPEN LEDGER")).toBeVisible();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: /私域关系网络/ }).click();
  await page.getByPlaceholder("邀请码 / UID").fill("DEMO-INVITE");
  await page.getByRole("button", { name: /下一步/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "确认绑定" }).click();
  await expect(page.getByRole("status")).toContainText("邀请关系已记录");
});

test("Telegram runtime cannot silently continue when the API is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { Telegram: { WebApp: { initData: string; BackButton: { show: () => void; hide: () => void; onClick: () => void; offClick: () => void } } } }).Telegram = { WebApp: { initData: "signed-init-data-placeholder", BackButton: { show: () => undefined, hide: () => undefined, onClick: () => undefined, offClick: () => undefined } } };
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "建立你的设备节点" })).toBeVisible();
  await expect(page.getByText("当前客户端没有 SecureStorage")).toBeVisible();
  await expect(page.getByRole("button", { name: "返回" })).toHaveCount(0);
  await page.getByRole("button", { name: /绑定本设备/ }).click();
  await expect(page.getByRole("heading", { name: "建立你的设备节点" })).toBeVisible();
  await expect(page.getByText("设备绑定失败")).toBeVisible();
});
