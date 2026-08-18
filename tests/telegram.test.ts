import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { demoBotResponse, safeEqualText, validateTelegramInitData } from "@project12/telegram";

describe("Telegram boundary", () => {
  it("keeps Bot integration mock-only without a token", () => expect(demoBotResponse().status).toBe("MOCK_ONLY"));
  it("rejects missing signed initData", () => expect(() => validateTelegramInitData("", "token")).toThrow());
  it("rejects initData from too far in the future", () => expect(() => validateTelegramInitData(`auth_date=${Math.floor(Date.now() / 1000) + 120}&hash=ignored`, "token")).toThrow("expired"));
  it("rejects signed data without query_id", () => {
    const botToken = "test-token";
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 42 }) });
    const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
    const secret = createHash("sha256").update(botToken).digest();
    const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
    expect(() => validateTelegramInitData(`${params.toString()}&hash=${hash}`, botToken)).toThrow("expired");
  });
  it("compares webhook secrets without accepting a length mismatch", () => {
    expect(safeEqualText("secret", "secret")).toBe(true);
    expect(safeEqualText("secret", "secreT")).toBe(false);
    expect(safeEqualText("secret", "secret-longer")).toBe(false);
  });
  it("accepts a fresh Telegram signature and returns the user identity", () => {
    const botToken = "test-token";
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AA-test", user: JSON.stringify({ id: 42, username: "p12" }) });
    const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
    const secret = createHash("sha256").update(botToken).digest();
    const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
    const result = validateTelegramInitData(`${params.toString()}&hash=${hash}`, botToken);
    expect(result).toMatchObject({ userId: "42", username: "p12" });
  });
});
