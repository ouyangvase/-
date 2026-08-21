import { describe, expect, it } from "vitest";
import { createTranslator, formatMoney, normalizeLocale, resolveLocale, supportedLocales, translate } from "@project12/i18n";

describe("project12 i18n", () => {
  it("supports the fifteen selectable locales and normalizes Telegram language codes", () => {
    expect(supportedLocales).toEqual(["zh-CN", "zh-TW", "en", "ms", "th", "vi", "id", "ta", "my", "km", "hi", "ar", "ja", "ko", "fil"]);
    expect(normalizeLocale("zh-Hans")).toBe("zh-CN");
    expect(normalizeLocale("zh-Hant")).toBe("zh-TW");
    expect(normalizeLocale("ms-MY")).toBe("ms");
    expect(normalizeLocale("ja-JP")).toBe("ja");
    expect(normalizeLocale("ko-KR")).toBe("ko");
    expect(normalizeLocale("tl-PH")).toBe("fil");
    expect(normalizeLocale("ta-IN")).toBe("ta");
    expect(normalizeLocale("my-MM")).toBe("my");
    expect(normalizeLocale("km-KH")).toBe("km");
    expect(normalizeLocale("hi-IN")).toBe("hi");
    expect(normalizeLocale("ar-SA")).toBe("ar");
    expect(resolveLocale(undefined, "vi-VN")).toBe("vi");
    expect(resolveLocale("unknown", "unknown")).toBe("en");
  });

  it("renders system templates from a key and payload", () => {
    expect(translate("zh-CN", "game.betting.opened", { durationSeconds: 50, minBet: 2, maxBet: 17 })).toContain("50");
    expect(translate("en", "game.betting.opened", { durationSeconds: 50, minBet: 2, maxBet: 17 })).toBe("Betting is open for 50 seconds. Range: 2–17.");
    expect(createTranslator("ms")("nav.wallet")).toBe("Dompet");
  });

  it("provides concrete core-flow copy for every launch locale", () => {
    for (const locale of supportedLocales) {
      expect(translate(locale, "setup.deviceTitle")).not.toBe("setup.deviceTitle");
      expect(translate(locale, "chat.roomLabel")).not.toBe("chat.roomLabel");
      expect(translate(locale, "verification.pendingTitle")).not.toBe("verification.pendingTitle");
    }
  });

  it("formats money with locale-aware decimal separators", () => {
    expect(formatMoney(1234.5, "en")).toBe("1,234.50");
    expect(formatMoney(1234.5, "id")).toBe("1.234,50");
  });
});
