import { describe, expect, it } from "vitest";
import { calculatePoints, demoPacketValue, hashSeed, classifyHand, compareHands, getMultiplier, assertTransition } from "@project12/game-engine";
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
    expect(() => assertTransition("BETTING", "CLAIMING")).not.toThrow();
    expect(() => assertTransition("SETTLED", "BETTING")).toThrow("Invalid round transition");
  });
});

describe("append-only demo ledger", () => {
  it("creates balanced journals and applies transfers", () => {
    const journal = createTransferJournal({ id: "J-1", referenceType: "BET", referenceId: "R-1", idempotencyKey: "K-1", reason: "lock demo bet", from: "USER_AVAILABLE", to: "USER_LOCKED", amount: 250 });
    expect(() => assertBalanced(journal)).not.toThrow();
    expect(applyJournal({ USER_AVAILABLE: 500, USER_LOCKED: 0, BANKER_POOL: 0, PLATFORM_FEE: 0, DEMO_GRANTS: 0 }, journal)).toMatchObject({ USER_AVAILABLE: 250, USER_LOCKED: 250 });
  });
  it("rejects a transfer that would create negative balance", () => {
    const journal = createTransferJournal({ id: "J-2", referenceType: "BET", referenceId: "R-1", idempotencyKey: "K-2", reason: "lock demo bet", from: "USER_AVAILABLE", to: "USER_LOCKED", amount: 250 });
    expect(() => applyJournal({ USER_AVAILABLE: 100, USER_LOCKED: 0, BANKER_POOL: 0, PLATFORM_FEE: 0, DEMO_GRANTS: 0 }, journal)).toThrow("negative balance");
  });
});
