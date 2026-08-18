import { describe, expect, it } from "vitest";
import { hashPin, validPin, verifyPin } from "../apps/api/src/security";

describe("security PINs", () => {
  it("accepts only non-trivial six digit PINs", () => {
    expect(validPin("482915")).toBe(true);
    expect(validPin("123456")).toBe(false);
    expect(validPin("111111")).toBe(false);
    expect(validPin("12345")).toBe(false);
  });

  it("uses an Argon2id encoded hash that verifies without storing plaintext", async () => {
    const encoded = await hashPin("482915");
    expect(encoded.startsWith("$argon2id$")).toBe(true);
    expect(encoded).not.toContain("482915");
    await expect(verifyPin(encoded, "482915")).resolves.toBe(true);
    await expect(verifyPin(encoded, "482916")).resolves.toBe(false);
  });
});
