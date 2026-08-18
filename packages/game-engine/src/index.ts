import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export const roundStates = [
  "DRAFT", "WAITING_FOR_PLAYERS", "BANKER_BIDDING", "BANKER_CONFIRMED", "BETTING", "BETTING_CLOSED",
  "DEMO_PACKET_READY", "CLAIMING", "CLAIMING_CLOSED", "RESOLVING", "SETTLING", "SETTLED",
  "CANCELLED", "REFUNDING", "REFUNDED", "DISPUTED"
] as const;

export type RoundState = typeof roundStates[number];

const allowedTransitions: Record<RoundState, readonly RoundState[]> = {
  DRAFT: ["WAITING_FOR_PLAYERS", "CANCELLED"],
  WAITING_FOR_PLAYERS: ["BANKER_BIDDING", "CANCELLED"],
  BANKER_BIDDING: ["BANKER_CONFIRMED", "CANCELLED"],
  BANKER_CONFIRMED: ["BETTING", "CANCELLED"],
  BETTING: ["BETTING_CLOSED", "CLAIMING", "CANCELLED"],
  BETTING_CLOSED: ["DEMO_PACKET_READY", "CANCELLED"],
  DEMO_PACKET_READY: ["CLAIMING", "CANCELLED"],
  CLAIMING: ["CLAIMING_CLOSED", "RESOLVING", "CANCELLED"],
  CLAIMING_CLOSED: ["RESOLVING", "CANCELLED"],
  RESOLVING: ["SETTLING", "CANCELLED"],
  SETTLING: ["SETTLED", "DISPUTED"],
  SETTLED: [],
  CANCELLED: ["REFUNDING", "REFUNDED"],
  REFUNDING: ["REFUNDED", "DISPUTED"],
  REFUNDED: [],
  DISPUTED: ["SETTLING", "REFUNDING"]
};

export function canTransition(from: RoundState, to: RoundState): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: RoundState, to: RoundState): void {
  if (!canTransition(from, to)) throw new Error(`Invalid round transition: ${from} -> ${to}`);
}

export type HandType = "豹子" | "满牛" | "反顺" | "顺子" | "对子" | "金牛" | "普通点数";

export interface RuleVersion {
  id: string;
  feeRate: number;
  claimTimeoutSeconds: number;
  multipliers: Record<HandType, number>;
}

export const demoRules: RuleVersion = {
  id: "demo-v1-source-confirmed-examples",
  feeRate: 0.05,
  claimTimeoutSeconds: 45,
  multipliers: { 豹子: 17, 满牛: 15, 反顺: 14, 顺子: 13, 对子: 12, 金牛: 11, 普通点数: 1 }
};

export function calculatePoints(values: number[]): number {
  if (values.length === 0) throw new Error("At least one value is required");
  const total = values.reduce((sum, value) => sum + value, 0);
  const point = total % 10;
  return point === 0 ? 10 : point;
}

export function classifyHand(values: number[]): { type: HandType; points: number } {
  const points = calculatePoints(values);
  const sorted = [...values].sort((a, b) => a - b);
  const allSame = sorted.every((value) => value === sorted[0]);
  const hasPair = values.length === 3 && new Set(values).size < values.length;
  const isStraight = values.length === 3 && sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
  if (allSame) return { type: "豹子", points };
  if (sorted.length === 3 && sorted.join(",") === "0,8,8") return { type: "满牛", points };
  if (isStraight && values[0] > values[2]) return { type: "反顺", points };
  if (isStraight && values[0] < values[2]) return { type: "顺子", points };
  if (sorted.length === 3 && sorted.join(",") === "0,0,5") return { type: "金牛", points };
  if (hasPair) return { type: "对子", points };
  return { type: "普通点数", points };
}

export function getMultiplier(hand: { type: HandType; points: number }): number {
  return hand.type === "普通点数" ? hand.points : demoRules.multipliers[hand.type];
}

export function hashSeed(seed: string): string {
  return bytesToHex(sha256(utf8ToBytes(seed)));
}

export function demoPacketValue(serverSeed: string, roundId: string, userId: string, claimSequence: number, min = 10, max = 99): number {
  if (max < min) throw new Error("Invalid packet range");
  const input = `${roundId}:${userId}:${claimSequence}`;
  const digest = hmac(sha256, utf8ToBytes(serverSeed), utf8ToBytes(input));
  const number = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getUint32(0);
  return min + (number % (max - min + 1));
}

export function compareHands(
  player: { type?: HandType; points: number; amount?: number },
  banker: { type?: HandType; points: number; amount?: number }
): "PLAYER_WIN" | "BANKER_WIN" | "TIE" {
  const rank: Record<HandType, number> = { 普通点数: 1, 金牛: 2, 对子: 3, 顺子: 4, 反顺: 5, 满牛: 6, 豹子: 7 };
  const playerRank = rank[player.type ?? "普通点数"];
  const bankerRank = rank[banker.type ?? "普通点数"];
  if (playerRank > bankerRank) return "PLAYER_WIN";
  if (playerRank < bankerRank) return "BANKER_WIN";
  if (player.points > banker.points) return "PLAYER_WIN";
  if (player.points < banker.points) return "BANKER_WIN";
  if (player.amount !== undefined && banker.amount !== undefined) {
    if (player.amount > banker.amount) return "PLAYER_WIN";
    if (player.amount < banker.amount) return "BANKER_WIN";
  }
  return "TIE";
}
