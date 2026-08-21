import { describe, expect, it } from "vitest";
import { calculatePoints, demoPacketValue, hashSeed, classifyHand, compareHands, getMultiplier, assertTransition, amountDigits, packetPoints, chooseBanker, orderClaimsForSettlement, assignTailPackets, settlePlayer } from "@project12/game-engine";
import { applyJournal, assertBalanced, createTransferJournal } from "@project12/ledger";

describe("demo game engine", () => {
  it("calculates zero as ten points", () => expect(calculatePoints([1, 2, 7])).toBe(10));
  it("classifies repeated values before ordinary points", () => expect(classifyHand([4, 4, 4]).type).toBe("豹子"));
  it("matches the source deck's special-hand examples", () => {
    expect(classifyHand([8, 8, 0]).type).toBe("满牛");
    expect(classifyHand([9, 8, 7]).type).toBe("反顺");
    expect(classifyHand([1, 2, 3]).type).toBe("顺子");
    expect(classifyHand([7, 5, 5]).type).toBe("对子");
    expect(classifyHand([0, 5, 0]).type).toBe("金牛");
  });
  it("uses ordinary points as the ordinary multiplier", () => expect(getMultiplier({ type: "普通点数", points: 9 })).toBe(9));
  it("keeps packet values reproducible", () => expect(demoPacketValue("seed", "R-1", "U-1", 1)).toBe(demoPacketValue("seed", "R-1", "U-1", 1)));
  it("hashes the committed seed", () => expect(hashSeed("seed")).toHaveLength(64));
  it("compares player and banker without assuming a loss", () => expect(compareHands({ points: 10 }, { points: 10 })).toBe("TIE"));
  it("compares special rank before amount", () => expect(compareHands({ type: "豹子", points: 10, amount: 1 }, { type: "满牛", points: 10, amount: 99 })).toBe("PLAYER_WIN"));
  it("uses amount as the final tie breaker", () => expect(compareHands({ type: "普通点数", points: 9, amount: 3.42 }, { type: "普通点数", points: 9, amount: 1.08 })).toBe("PLAYER_WIN"));
  it("allows only server state-machine transitions", () => {
    expect(() => assertTransition("BETTING", "WAITING_BANKER_CONFIRM")).not.toThrow();
    expect(() => assertTransition("WAITING_BANKER_CONFIRM", "PACKET_SENT")).not.toThrow();
    expect(() => assertTransition("PACKET_SENT", "CLAIMING")).not.toThrow();
    expect(() => assertTransition("ROUND_COMPLETE", "BETTING")).toThrow("Invalid round transition");
  });
  it("supports the canonical happy path and cancellation/refund terminals", () => {
    expect(() => {
      assertTransition("LOBBY", "BANKER_BIDDING");
      assertTransition("BANKER_BIDDING", "BETTING");
      assertTransition("BETTING", "WAITING_BANKER_CONFIRM");
      assertTransition("WAITING_BANKER_CONFIRM", "PACKET_SENT");
      assertTransition("PACKET_SENT", "CLAIMING");
      assertTransition("CLAIMING", "EVALUATING");
      assertTransition("EVALUATING", "SETTLING");
      assertTransition("SETTLING", "ROUND_COMPLETE");
      assertTransition("BETTING", "ROUND_CANCELLED");
      assertTransition("ROUND_CANCELLED", "REFUNDING");
      assertTransition("REFUNDING", "REFUNDED");
    }).not.toThrow();
  });
});

describe("append-only demo ledger", () => {
  it("creates balanced journals and applies transfers", () => {
    const journal = createTransferJournal({ id: "J-1", referenceType: "BET", referenceId: "R-1", idempotencyKey: "K-1", reason: "lock demo bet", from: "USER_AVAILABLE", to: "USER_LOCKED", amount: 250 });
    expect(() => assertBalanced(journal)).not.toThrow();
    expect(applyJournal({ USER_AVAILABLE: 500, USER_LOCKED: 0, USER_LOCKED_BANKER_POOL: 0, BANKER_POOL: 0, PLATFORM_FEE: 0, DEMO_GRANTS: 0, CAMPAIGN_REWARD_RESERVE: 0, PENDING_ADJUSTMENT: 0 }, journal)).toMatchObject({ USER_AVAILABLE: 250, USER_LOCKED: 250 });
  });
  it("keeps two-decimal fee transfers balanced", () => {
    const journal = createTransferJournal({ id: "J-DECIMAL", referenceType: "FEE", referenceId: "R-1", idempotencyKey: "K-DECIMAL", reason: "demo fee", from: "BANKER_POOL", to: "PLATFORM_FEE", amount: 0.5 });
    expect(() => assertBalanced(journal)).not.toThrow();
    expect(applyJournal({ USER_AVAILABLE: 0, USER_LOCKED: 0, USER_LOCKED_BANKER_POOL: 0, BANKER_POOL: 1, PLATFORM_FEE: 0, DEMO_GRANTS: 0, CAMPAIGN_REWARD_RESERVE: 0, PENDING_ADJUSTMENT: 0 }, journal)).toMatchObject({ BANKER_POOL: 0.5, PLATFORM_FEE: 0.5 });
  });
  it("rejects a transfer that would create negative balance", () => {
    const journal = createTransferJournal({ id: "J-2", referenceType: "BET", referenceId: "R-1", idempotencyKey: "K-2", reason: "lock demo bet", from: "USER_AVAILABLE", to: "USER_LOCKED", amount: 250 });
    expect(() => applyJournal({ USER_AVAILABLE: 100, USER_LOCKED: 0, USER_LOCKED_BANKER_POOL: 0, BANKER_POOL: 0, PLATFORM_FEE: 0, DEMO_GRANTS: 0, CAMPAIGN_REWARD_RESERVE: 0, PENDING_ADJUSTMENT: 0 }, journal)).toThrow("negative balance");
  });
});

describe("source-confirmed settlement rules", () => {
  it("calculates RM3.42 as 9 points and RM1.11 as豹子", () => {
    expect(amountDigits("RM3.42")).toEqual([3, 4, 2]);
    expect(packetPoints("RM3.42")).toBe(9);
    expect(classifyHand(amountDigits("RM1.11")).type).toBe("豹子");
  });
  it("chooses equal bids by earlier server receipt", () => {
    expect(chooseBanker([{ userId: "late", amount: 500, serverReceivedAt: "2026-01-01T00:00:02Z" }, { userId: "early", amount: 500, serverReceivedAt: "2026-01-01T00:00:01Z" }])?.userId).toBe("early");
  });
  it("returns 185.50 after a 100 balance wins a 10 stake at 9x", () => {
    const result = settlePlayer({ stake: 10, player: { type: "普通点数", points: 9, amount: 3.42 }, banker: { type: "普通点数", points: 8, amount: 2.22 }, bankerPool: 1000 });
    expect(result).toMatchObject({ outcome: "WIN", grossReward: 90, fee: 4.5, netReward: 85.5, playerCredit: 95.5 });
    expect(100 - 10 + result.playerCredit).toBe(185.5);
  });
  it("pays banker 9.50 and platform 0.50 when a 10 stake loses", () => {
    const result = settlePlayer({ stake: 10, player: { type: "普通点数", points: 7, amount: 2.23 }, banker: { type: "普通点数", points: 9, amount: 3.42 }, bankerPool: 0 });
    expect(result).toMatchObject({ outcome: "LOSE", fee: 0.5, bankerCredit: 9.5, platformFee: 0.5 });
  });
  it("returns the stake with zero fee on exact ties", () => {
    const result = settlePlayer({ stake: 10, player: { type: "普通点数", points: 9, amount: 3.42 }, banker: { type: "普通点数", points: 9, amount: 3.42 }, bankerPool: 0 });
    expect(result).toMatchObject({ outcome: "TIE", playerCredit: 10, fee: 0 });
  });
  it("waters a win when the banker pool cannot cover gross reward", () => {
    const result = settlePlayer({ stake: 10, player: { type: "普通点数", points: 9, amount: 3.42 }, banker: { type: "普通点数", points: 8, amount: 2.22 }, bankerPool: 20 });
    expect(result).toMatchObject({ outcome: "WATERED", playerCredit: 10, grossReward: 90, fee: 0 });
  });
  it("orders multiple settlements by claimed_at then server receipt", () => {
    const ordered = orderClaimsForSettlement([
      { playerId: "b", amount: 10, claimedAt: "2026-01-01T00:00:02Z", serverReceivedAt: "2026-01-01T00:00:02Z", betAcceptedAt: "2026-01-01T00:00:01Z", source: "DEMO_CLAIM" },
      { playerId: "a", amount: 10, claimedAt: "2026-01-01T00:00:01Z", serverReceivedAt: "2026-01-01T00:00:03Z", betAcceptedAt: "2026-01-01T00:00:02Z", source: "DEMO_CLAIM" }
    ]);
    expect(ordered.map((item) => item.playerId)).toEqual(["a", "b"]);
  });
  it("assigns tail packets by bet acceptance order", () => {
    expect(assignTailPackets([{ playerId: "late", betAcceptedAt: "2026-01-01T00:00:02Z" }, { playerId: "early", betAcceptedAt: "2026-01-01T00:00:01Z" }], new Set(["late"]))).toEqual(["early"]);
  });
});
