import { describe, expect, it } from "vitest";
import { createBootDiagnostics } from "../apps/miniapp/src/boot-diagnostics";

describe("Telegram boot diagnostics", () => {
  it("identifies a browser-opened production URL", () => {
    const steps = createBootDiagnostics({ locale: "zh-CN", telegramShell: false, initDataPresent: false, launchTokenPresent: false, bootStatus: "offline", reason: "请从 Telegram Mini App 打开此应用" });
    expect(steps.map((step) => step.status)).toEqual(["failed", "skipped", "skipped", "skipped", "skipped"]);
  });

  it("isolates a rejected Telegram signature", () => {
    const steps = createBootDiagnostics({ locale: "zh-CN", telegramShell: true, initDataPresent: true, launchTokenPresent: false, bootStatus: "error", reason: "Telegram signature invalid" });
    expect(steps.map((step) => step.status)).toEqual(["passed", "passed", "failed", "skipped", "skipped"]);
  });

  it("marks the complete production chain as healthy", () => {
    const steps = createBootDiagnostics({ locale: "en", telegramShell: true, initDataPresent: true, launchTokenPresent: false, bootStatus: "ready", reason: "" });
    expect(steps.map((step) => step.status)).toEqual(["passed", "passed", "passed", "passed", "passed"]);
  });

  it("keeps auth and session green when the room service fails later", () => {
    const steps = createBootDiagnostics({ locale: "en", telegramShell: true, initDataPresent: true, launchTokenPresent: false, bootStatus: "error", reason: "Production room unavailable" });
    expect(steps.map((step) => step.status)).toEqual(["passed", "passed", "passed", "passed", "failed"]);
  });
});
