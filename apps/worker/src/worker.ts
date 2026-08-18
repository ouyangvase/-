type DemoRoundState = "BETTING" | "CLAIMING" | "RESOLVING" | "SETTLING" | "SETTLED";

const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 1000);
const locks = new Set<string>();
const demoRounds = new Map<string, DemoRoundState>([["R-0247", "BETTING"]]);

export function withAdvisoryLock<T>(key: string, work: () => T): T | undefined {
  if (locks.has(key)) return undefined;
  locks.add(key);
  try { return work(); } finally { locks.delete(key); }
}

export function advanceDemoRound(roundId: string, target: DemoRoundState): DemoRoundState | undefined {
  return withAdvisoryLock(`round:${roundId}`, () => {
    const current = demoRounds.get(roundId);
    if (!current) return undefined;
    const order: DemoRoundState[] = ["BETTING", "CLAIMING", "RESOLVING", "SETTLING", "SETTLED"];
    if (order.indexOf(target) < order.indexOf(current)) return current;
    demoRounds.set(roundId, target);
    return target;
  });
}

console.log(`PROJECT 12 demo worker ready; state transitions use a single-flight advisory lock (interval ${intervalMs}ms).`);
setInterval(() => console.log(JSON.stringify({ service: "worker", mode: "demo", action: "heartbeat", activeRounds: demoRounds.size, at: new Date().toISOString() })), intervalMs);
