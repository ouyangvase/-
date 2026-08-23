import { describe, expect, it } from "vitest";
import { advanceDemoRound, claimUnpublishedOutbox, withAdvisoryLock } from "../apps/worker/src/worker";
import { formatBankerBettingOpened, formatBettingInstructions, formatBettingSummary, formatSettlementNotice, hasValidBankerBid, nextTimedState, toPublicSettlementResult } from "../apps/worker/src/round-advancer";

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

  it("formats the automatic betting close as a real chat event", () => {
    expect(formatBettingSummary([{ displayName: "player-one", amount: 5 }, { displayName: "player-two", amount: 10 }])).toContain("本局下注成功名单（2）");
    expect(formatBettingSummary([{ displayName: "player-one", amount: 5 }])).toContain("@player-one 5");
    expect(formatBettingSummary([{ displayName: "@player-one", amount: 5 }])).not.toContain("@@player-one");
  });

  it("shows the banker identity and amount when betting starts", () => {
    expect(formatBankerBettingOpened("@dealer", 500)).toBe("平台通知：@dealer 抢庄 500 PT，当前进入下注阶段。");
    expect(formatBankerBettingOpened(null, null)).toContain("最高庄金玩家");
  });

  it("shows the banker identity in the automatic settlement notice", () => {
    expect(formatSettlementNotice("@dealer", "牛牛", 12, 500)).toBe("📊 本局成绩已公布\n庄家：@dealer · 牛牛12 · 牌面 500");
    expect(formatSettlementNotice("banker", "普通点数", 7, 300)).toContain("庄家：@banker");
  });

  it("formats the automatic betting instructions used by the chat flow", () => {
    expect(formatBettingInstructions()).toContain("下注时长：50 秒");
    expect(formatBettingInstructions()).toContain("梭哈范围：sh10～sh177");
    expect(formatBettingInstructions()).toContain("下注请直接发送金额");
  });

  it("keeps automatic settlement results structured for the chat scoreboard", () => {
    expect(toPublicSettlementResult({
      displayName: "player-one",
      betAmount: 5,
      packetValue: 22,
      hand: { type: "普通点数", points: 4 },
      bankerPoolBefore: 100,
      settlement: { outcome: "WIN", multiplier: 4, grossReward: 20, fee: 1, netReward: 19, bankerPoolAfter: 80 }
    })).toMatchObject({ userId: "player-one", betAmount: 5, packetValue: 22, outcome: "WIN", netReward: 19 });
  });
});
