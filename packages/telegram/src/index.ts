import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function safeEqualText(expected: string, received: string | undefined): boolean {
  if (!received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 86400): { userId: string; username?: string } {
  if (!initData || !botToken) throw new Error("Telegram initData and Bot token are required");
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (!params.get("query_id") || !receivedHash || !Number.isFinite(authDate) || age > maxAgeSeconds || age < -60) throw new Error("Invalid or expired Telegram initData");
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqualText(calculated, receivedHash)) throw new Error("Telegram initData signature mismatch");
  const user = JSON.parse(params.get("user") ?? "{}");
  if (!user.id) throw new Error("Telegram user identity missing");
  return { userId: String(user.id), username: user.username };
}

export function createTelegramLaunchToken(updateId: number, telegramUserId: string, expiresAt: number, secret = process.env.SESSION_SECRET ?? "project12-demo-session-fallback"): string {
  const payload = Buffer.from(JSON.stringify({ updateId, telegramUserId, expiresAt }), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function telegramLaunchTokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }

export function demoBotResponse(): { status: "MOCK_ONLY"; message: string } {
  return { status: "MOCK_ONLY", message: "Bot adapter is disabled until a user-supplied Bot token is configured." };
}
