const base = process.env.API_URL ?? "http://127.0.0.1:8787";
const virtualUsers = Number(process.env.LOAD_USERS ?? 100);
const roundsPerUser = Number(process.env.LOAD_ROUNDS ?? 20);
const latencies: number[] = [];
let failed = 0;

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, init);
  latencies.push(performance.now() - started);
  if (!response.ok) failed += 1;
  return response;
}

async function main() {
const sessions = await Promise.all(Array.from({ length: virtualUsers }, async (_, index) => {
  const user = `load-user-${String(index + 1).padStart(3, "0")}`;
  const response = await request("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json", "x-demo-user": user }, body: "{}" });
  const data = await response.json() as { token: string };
  return { user, token: data.token };
}));

for (const session of sessions) {
  const jobs = Array.from({ length: roundsPerUser }, (_, round) => request("/api/rooms/room-12/join", {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-user": session.user, "x-session-token": session.token, "idempotency-key": `${session.user}-round-${round}` },
    body: "{}"
  }));
  await Promise.all(jobs);
  await request("/api/rooms/room-12/join", {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-user": session.user, "x-session-token": session.token, "idempotency-key": `${session.user}-round-0` },
    body: "{}"
  });
}

const sorted = latencies.sort((a, b) => a - b);
const percentile = (value: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] ?? 0);
const report = { base, virtualUsers, roundsPerUser, requests: latencies.length, failed, p50Ms: percentile(.5), p95Ms: percentile(.95), idempotencyReplayRequests: virtualUsers };
console.log(JSON.stringify(report, null, 2));
if (failed > 0) process.exit(1);
}

void main();
