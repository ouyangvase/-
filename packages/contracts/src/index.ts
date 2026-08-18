export type RoundState =
  | "DRAFT" | "WAITING_FOR_PLAYERS" | "BANKER_BIDDING" | "BANKER_CONFIRMED" | "BETTING"
  | "BETTING_CLOSED" | "DEMO_PACKET_READY" | "CLAIMING" | "CLAIMING_CLOSED"
  | "RESOLVING" | "SETTLING" | "SETTLED" | "CANCELLED" | "REFUNDING"
  | "REFUNDED" | "DISPUTED";

export type UserRole = "PLAYER" | "BANKER" | "ADMIN";

export interface DemoUser {
  id: string;
  displayName: string;
  role: UserRole;
  available: number;
  locked: number;
  riskStatus: "CLEAR" | "REVIEW" | "HELD" | "REJECTED";
}

export interface RoundSummary {
  id: string;
  state: RoundState;
  ruleVersion: string;
  endsAt: string;
  players: number;
  banker: string;
  seedHash: string;
  bankPool: number;
}

export interface DemoState {
  user: DemoUser;
  round: RoundSummary;
  missions: Array<{ id: string; title: string; progress: number; target: number; reward: number }>;
  referrals: { code: string; direct: number; qualified: number; pendingReward: number };
  leaderboard?: Array<{ userId: string; displayName: string; points: number; rank: number }>;
  ledger: Array<{ id: string; reason: string; change: number; balanceAfter: number; createdAt: string }>;
}
