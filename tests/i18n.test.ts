import { describe, expect, it } from "vitest";
import { createTranslator, formatMoney, normalizeLocale, resolveLocale, supportedLocales, translate } from "@project12/i18n";

describe("project12 i18n", () => {
  it("supports the six launch locales and normalizes Telegram language codes", () => {
    expect(supportedLocales).toEqual(["zh-CN", "en", "ms", "th", "vi", "id"]);
    expect(normalizeLocale("zh-Hans")).toBe("zh-CN");
    expect(normalizeLocale("ms-MY")).toBe("ms");
    expect(resolveLocale(undefined, "vi-VN")).toBe("vi");
    expect(resolveLocale("unknown", "unknown")).toBe("en");
  });

  it("renders system templates from a key and payload", () => {
    expect(translate("zh-CN", "game.betting.opened", { durationSeconds: 50, minBet: 2, maxBet: 17 })).toContain("50");
    expect(translate("en", "game.betting.opened", { durationSeconds: 50, minBet: 2, maxBet: 17 })).toBe("Betting is open for 50 seconds. Range: 2–17.");
    expect(createTranslator("ms")("nav.wallet")).toBe("Dompet");
  });

  it("formats money with locale-aware decimal separators", () => {
    expect(formatMoney(1234.5, "en")).toBe("1,234.50");
    expect(formatMoney(1234.5, "id")).toBe("1.234,50");
  });
});
