import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export const roundStates = [
  "LOBBY", "BANKER_BIDDING", "BETTING", "WAITING_BANKER_CONFIRM", "PACKET_SENT", "CLAIMING", "EVALUATING", "SETTLING", "ROUND_COMPLETE",
  "ROUND_CANCELLED", "REFUNDING", "REFUNDED", "DISPUTED"
] as const;
export type RoundState = typeof roundStates[number];

const allowedTransitions: Record<RoundState, readonly RoundState[]> = {
  LOBBY: ["BANKER_BIDDING", "ROUND_CANCELLED"],
  BANKER_BIDDING: ["BETTING", "ROUND_CANCELLED"],
  BETTING: ["WAITING_BANKER_CONFIRM", "ROUND_CANCELLED"],
  WAITING_BANKER_CONFIRM: ["PACKET_SENT", "ROUND_CANCELLED"],
  PACKET_SENT: ["CLAIMING", "ROUND_CANCELLED"],
  CLAIMING: ["EVALUATING", "ROUND_CANCELLED"],
  EVALUATING: ["SETTLING", "ROUND_CANCELLED"],
  SETTLING: ["ROUND_COMPLETE", "DISPUTED"],
  ROUND_COMPLETE: [],
  ROUND_CANCELLED: ["REFUNDING", "REFUNDED"],
  REFUNDING: ["REFUNDED", "DISPUTED"],
  REFUNDED: [],
  DISPUTED: ["SETTLING", "REFUNDING"]
};

export function canTransition(from: RoundState, to: RoundState): boolean { return allowedTransitions[from].includes(to); }
export function assertTransition(from: RoundState, to: RoundState): void { if (!canTransition(from, to)) throw new Error(`Invalid round transition: ${from} -> ${to}`); }

export type HandType = "豹子" | "满牛" | "反顺" | "顺子" | "对子" | "金牛" | "普通点数";
export type RoundOutcome = "WIN" | "LOSE" | "TIE" | "WATERED";
export type RuleConfidence = "SOURCE_CONFIRMED_EXAMPLES" | "UNVERIFIED";

export interface RuleVersion {
  id: string;
  feeRate: number;
  claimTimeoutSeconds: number;
  multipliers: Record<HandType, number>;
  confidence: RuleConfidence;
}

export const demoRules: RuleVersion = {
  id: "demo-v1-source-confirmed-examples",
  feeRate: 0.05,
  claimTimeoutSeconds: 45,
  multipliers: { 豹子: 17, 满牛: 15, 反顺: 14, 顺子: 13, 对子: 12, 金牛: 11, 普通点数: 1 },
  confidence: "SOURCE_CONFIRMED_EXAMPLES"
};

export function calculatePoints(values: number[]): number {
  if (values.length === 0) throw new Error("At least one value is required");
  const total = values.reduce((sum, value) => sum + value, 0);
  const point = total % 10;
  return point === 0 ? 10 : point;
}

export function amountDigits(amount: number | string): number[] {
  const raw = String(amount).replace(/^RM\s*/i, "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error("Packet amount must be numeric");
  const [whole, fraction = ""] = raw.split(".");
  const digits = `${whole}${fraction}`.split("").map(Number);
  if (digits.length === 0 || digits.some((value) => !Number.isInteger(value))) throw new Error("Packet amount digits are invalid");
  return digits;
}

export function packetPoints(amount: number | string): number { return calculatePoints(amountDigits(amount)); }

export function classifyHand(values: number[]): { type: HandType; points: number } {
  if (values.length !== 3 || values.some((value) => !Number.isInteger(value) || value < 0 || value > 9)) throw new Error("A hand must contain three digits from 0 to 9");
  const points = calculatePoints(values);
  const sorted = [...values].sort((a, b) => a - b);
  const allSame = sorted.every((value) => value === sorted[0]);
  const hasPair = new Set(values).size < values.length;
  const isStraight = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
  if (allSame) return { type: "豹子", points };
  if (sorted.join(",") === "0,8,8") return { type: "满牛", points };
  if (isStraight && values[0] > values[2]) return { type: "反顺", points };
  if (isStraight && values[0] < values[2]) return { type: "顺子", points };
  if (sorted.join(",") === "0,0,5") return { type: "金牛", points };
  if (hasPair) return { type: "对子", points };
  return { type: "普通点数", points };
}

export function classifyPacket(amount: number | string): { amount: string; digits: number[]; hand: { type: HandType; points: number }; multiplier: number } {
  const normalized = typeof amount === "number" ? amount.toFixed(2) : String(amount).replace(/^RM\s*/i, "");
  const digits = amountDigits(normalized);
  const hand = classifyHand(digits.slice(-3));
  return { amount: normalized, digits, hand, multiplier: getMultiplier(hand) };
}

export function getMultiplier(hand: { type: HandType; points: number }): number { return hand.type === "普通点数" ? hand.points : demoRules.multipliers[hand.type]; }

export function hashSeed(seed: string): string { return bytesToHex(sha256(utf8ToBytes(seed))); }

export function demoPacketValue(serverSeed: string, roundId: string, userId: string, claimSequence: number, min = 10, max = 99): number {
  if (max < min) throw new Error("Invalid packet range");
  const input = `${roundId}:${userId}:${claimSequence}`;
  const digest = hmac(sha256, utf8ToBytes(serverSeed), utf8ToBytes(input));
  const number = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getUint32(0);
  return min + (number % (max - min + 1));
}

export function demoRoundHand(serverSeed: string, roundId: string): { amount: string; digits: number[]; hand: { type: HandType; points: number } } {
  const value = demoPacketValue(serverSeed, roundId, "__BANKER__", 0, 0, 999);
  const digits = String(value).padStart(3, "0").split("").map(Number);
  const amount = `${digits[0]}.${digits[1]}${digits[2]}`;
  return { amount, digits, hand: classifyHand(digits) };
}

const handRank: Record<HandType, number> = { 普通点数: 1, 金牛: 2, 对子: 3, 顺子: 4, 反顺: 5, 满牛: 6, 豹子: 7 };
export function compareHands(player: { type?: HandType; points: number; amount?: number }, banker: { type?: HandType; points: number; amount?: number }): "PLAYER_WIN" | "BANKER_WIN" | "TIE" {
  const playerRank = handRank[player.type ?? "普通点数"];
  const bankerRank = handRank[banker.type ?? "普通点数"];
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

export interface BankerBid { userId: string; amount: number; serverReceivedAt: string | number; }
export function chooseBanker(bids: BankerBid[]): BankerBid | undefined {
  return [...bids].sort((a, b) => b.amount - a.amount || new Date(a.serverReceivedAt).getTime() - new Date(b.serverReceivedAt).getTime())[0];
}

export interface ClaimRecord { playerId: string; amount: number; claimedAt: string; serverReceivedAt: string; betAcceptedAt: string; source: "DIRECT_CLAIM" | "PROXY_CLAIM" | "DEMO_CLAIM"; }
export function orderClaimsForSettlement(claims: ClaimRecord[]): ClaimRecord[] {
  return [...claims].sort((a, b) => new Date(a.claimedAt).getTime() - new Date(b.claimedAt).getTime() || new Date(a.serverReceivedAt).getTime() - new Date(b.serverReceivedAt).getTime());
}
export function assignTailPackets(players: Array<{ playerId: string; betAcceptedAt: string }>, claimedPlayerIds: Set<string>): string[] {
  return players.filter((player) => !claimedPlayerIds.has(player.playerId)).sort((a, b) => new Date(a.betAcceptedAt).getTime() - new Date(b.betAcceptedAt).getTime()).map((player) => player.playerId);
}

function money(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
export interface SettlementInput { stake: number; player: { type?: HandType; points: number; amount?: number }; banker: { type?: HandType; points: number; amount?: number }; bankerPool: number; feeRate?: number; }
export interface SettlementResult { outcome: RoundOutcome; stake: number; multiplier: number; grossReward: number; fee: number; netReward: number; playerCredit: number; bankerCredit: number; platformFee: number; bankerPoolAfter: number; }

export function settlePlayer(input: SettlementInput): SettlementResult {
  if (!Number.isFinite(input.stake) || input.stake <= 0) throw new Error("Stake must be positive");
  const feeRate = input.feeRate ?? demoRules.feeRate;
  const comparison = compareHands(input.player, input.banker);
  const multiplier = getMultiplier({ type: input.player.type ?? "普通点数", points: input.player.points });
  const grossReward = money(input.stake * multiplier);
  if (comparison === "TIE") return { outcome: "TIE", stake: input.stake, multiplier, grossReward: 0, fee: 0, netReward: 0, playerCredit: input.stake, bankerCredit: 0, platformFee: 0, bankerPoolAfter: money(input.bankerPool) };
  if (comparison === "BANKER_WIN") {
    const fee = money(input.stake * feeRate);
    return { outcome: "LOSE", stake: input.stake, multiplier, grossReward: 0, fee, netReward: 0, playerCredit: 0, bankerCredit: money(input.stake - fee), platformFee: fee, bankerPoolAfter: money(input.bankerPool + input.stake - fee) };
  }
  if (input.bankerPool < grossReward) return { outcome: "WATERED", stake: input.stake, multiplier, grossReward, fee: 0, netReward: 0, playerCredit: input.stake, bankerCredit: 0, platformFee: 0, bankerPoolAfter: money(input.bankerPool) };
  const fee = money(grossReward * feeRate);
  const netReward = money(grossReward - fee);
  return { outcome: "WIN", stake: input.stake, multiplier, grossReward, fee, netReward, playerCredit: money(input.stake + netReward), bankerCredit: money(-grossReward), platformFee: fee, bankerPoolAfter: money(input.bankerPool - grossReward) };
}
