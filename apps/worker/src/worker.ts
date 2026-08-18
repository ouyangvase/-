type DemoRoundState = "LOBBY" | "BANKER_BIDDING" | "BETTING" | "PACKET_SENT" | "CLAIMING" | "EVALUATING" | "SETTLING" | "ROUND_COMPLETE" | "ROUND_CANCELLED" | "REFUNDING" | "REFUNDED" | "DISPUTED";

const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 1000);
const locks = new Set<string>();
const demoRounds = new Map<string, DemoRoundState>([["R-0247", "BETTING"]]);

export type OutboxEvent = { id: string; type: string; payload: Record<string, unknown>; publishedAt?: string };
export function claimUnpublishedOutbox(events: OutboxEvent[], limit = 100): OutboxEvent[] {
  const claimed = events.filter((event) => !event.publishedAt).slice(0, limit);
  const publishedAt = new Date().toISOString();
  for (const event of claimed) event.publishedAt = publishedAt;
  return claimed;
}

export function withAdvisoryLock<T>(key: string, work: () => T): T | undefined {
  if (locks.has(key)) return undefined;
  locks.add(key);
  try { return work(); } finally { locks.delete(key); }
}

export function advanceDemoRound(roundId: string, target: DemoRoundState): DemoRoundState | undefined {
  return withAdvisoryLock(`round:${roundId}`, () => {
    const current = demoRounds.get(roundId);
    if (!current) return undefined;
    const order: DemoRoundState[] = ["LOBBY", "BANKER_BIDDING", "BETTING", "PACKET_SENT", "CLAIMING", "EVALUATING", "SETTLING", "ROUND_COMPLETE"];
    if (order.indexOf(target) < order.indexOf(current)) return current;
    demoRounds.set(roundId, target);
    return target;
  });
}

console.log(`PROJECT 12 demo worker ready; state transitions use a single-flight advisory lock (interval ${intervalMs}ms).`);
setInterval(() => console.log(JSON.stringify({ service: "worker", mode: "demo", action: "heartbeat", activeRounds: demoRounds.size, at: new Date().toISOString() })), intervalMs);
