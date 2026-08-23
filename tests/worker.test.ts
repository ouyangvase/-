import { describe, expect, it } from "vitest";
import { advanceDemoRound, claimUnpublishedOutbox, withAdvisoryLock } from "../apps/worker/src/worker";
import { hasValidBankerBid, nextTimedState } from "../apps/worker/src/round-advancer";

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

  it("maps only safe deadline-driven states to the next durable state", () => {
    expect(nextTimedState("PACKET_SENT")).toBe("CLAIMING");
    expect(nextTimedState("CLAIMING")).toBe("EVALUATING");
    expect(nextTimedState("BANKER_BIDDING")).toBe("BETTING");
    expect(nextTimedState("BETTING")).toBe("WAITING_BANKER_CONFIRM");
    expect(nextTimedState("WAITING_BANKER_CONFIRM")).toBe("ROUND_CANCELLED");
  });

  it("keeps an expired banker phase alive when a valid bid exists", () => {
    expect(hasValidBankerBid(0)).toBe(false);
    expect(hasValidBankerBid("400")).toBe(true);
  });
});
