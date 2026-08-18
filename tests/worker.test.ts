import { describe, expect, it } from "vitest";
import { advanceDemoRound, claimUnpublishedOutbox, withAdvisoryLock } from "../apps/worker/src/worker";

describe("Worker runtime primitives", () => {
  it("claims each in-memory outbox event once", () => {
    const events = [{ id: "1", type: "TEST", payload: {} }, { id: "2", type: "TEST", payload: {} }];
    expect(claimUnpublishedOutbox(events)).toHaveLength(2);
    expect(claimUnpublishedOutbox(events)).toHaveLength(0);
  });

  it("prevents re-entrant work for the same advisory lock", () => {
    expect(withAdvisoryLock("round:test", () => withAdvisoryLock("round:test", () => "blocked"))).toBeUndefined();
  });

  it("keeps demo round transitions monotonic", () => {
    expect(advanceDemoRound("R-0247", "CLAIMING")).toBe("CLAIMING");
    expect(advanceDemoRound("R-0247", "BETTING")).toBe("CLAIMING");
  });
});
