import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { assertTransition, classifyHand, demoRules, hashSeed, settlePlayer } from "../../../packages/game-engine/src/index.js";
import { applyJournal, assertBalanced, createTransferJournal, type Journal, type LedgerAccount } from "../../../packages/ledger/src/index.js";
import { safeEqualText, validateTelegramInitData } from "../../../packages/telegram/src/index.js";
import type { DemoState, RoundState } from "@project12/contracts";
import { createPacketProvider, PacketProviderError } from "./providers/packet-provider.js";
import { ApiPersistence } from "./persistence.js";
import { hashPin, validPin } from "./runtime-security.js";

const port = Number(process.env.API_PORT ?? 8787);
const appMode = process.env.APP_MODE ?? "demo";
const telegramMockEnabled = appMode === "demo" && process.env.TELEGRAM_MOCK_ENABLED !== "false";
const realMoneyDisabled = process.env.REAL_MONEY_ENABLED !== "true";
const persistence = new ApiPersistence();
const sessions = new Map<string, { userId: string; role: "PLAYER" | "ADMIN"; expiresAt: number }>();
const requestSessions = new WeakMap<IncomingMessage, { userId: string; role: "PLAYER" | "ADMIN" }>();
const idempotency = new Map<string, unknown>();
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const baseBalances: Record<LedgerAccount, number> = { USER_AVAILABLE: 12500, USER_LOCKED: 0, USER_LOCKED_BANKER_POOL: 0, BANKER_POOL: 4800, PLATFORM_FEE: 0, DEMO_GRANTS: 12630, CAMPAIGN_REWARD_RESERVE: 0, PENDING_ADJUSTMENT: 0 };
const auditLogs: Array<{ id: string; actor: string; action: string; referenceType: string; referenceId: string; before?: unknown; after?: unknown; createdAt: string }> = [];
const roundEvents: Array<{ id: string; roundId: string; from?: RoundState; to: RoundState; payload: Record<string, unknown>; createdAt: string }> = [];
const realtimeClients = new Set<ServerResponse>();
const rewardClaims = new Set<string>();
const referralEdges: Array<{ referrerUserId: string; referredUserId: string; code: string; status: "PENDING" | "QUALIFIED"; source: string }> = [];
const deviceBindings = new Map<string, { userId: string; publicKey: string; fingerprint?: string; boundAt: string }>();
const securityPins = new Map<string, { hash: string; changedAt: string }>();
const onboarding = new Map<string, { deviceBound: boolean; referrerBound: boolean; pinSet: boolean; pendingReferral?: string }>();
const outboxEvents: Array<{ id: string; type: string; payload: Record<string, unknown>; createdAt: string; publishedAt?: string }> = [];
const webhookUpdateIds = new Set<number>();
const packetIds = new Map<string, string>();
const riskFlags: Array<{ id: string; userId?: string; roundId?: string; status: "OPEN" | "REVIEW" | "HELD" | "CLOSED"; reason: string; createdAt: string }> = [
  { id: "RF-019", userId: "demo-player-03", status: "REVIEW", reason: "Repeated referral pairing", createdAt: now() },
  { id: "RF-018", roundId: "R-0247", status: "HELD", reason: "Fast round completion", createdAt: now() }
];
const adjustments = new Map<string, { id: string; amount: number; reason: string; ticketId: string; createdBy: string; approvedBy?: string; status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" }>();
const serverSeed = "project12-demo-seed-247";
const packetProvider = createPacketProvider(persistence);

const baseState: DemoState = {
  user: { id: "demo-player-01", displayName: "Alex Tan", role: "PLAYER", available: baseBalances.USER_AVAILABLE, locked: baseBalances.USER_LOCKED, riskStatus: "CLEAR" },
  round: { id: "R-0247", state: "BANKER_BIDDING", ruleVersion: demoRules.id, endsAt: "00:28", players: 8, banker: "Mira", seedHash: hashSeed(serverSeed).slice(0, 16) + "…", bankPool: baseBalances.BANKER_POOL },
  missions: [{ id: "rounds", title: "Complete demo rounds", progress: 2, target: 3, reward: 120 }, { id: "login", title: "Return for 3 days", progress: 1, target: 3, reward: 80 }, { id: "hand", title: "Collect a special hand", progress: 0, target: 1, reward: 160 }],
  referrals: { code: "P12-ALEX", direct: 4, qualified: 2, pendingReward: 180 },
  leaderboard: [{ userId: "demo-player-01", displayName: "Alex Tan", points: 1280, rank: 1 }, { userId: "demo-banker-01", displayName: "Mira", points: 1140, rank: 2 }, { userId: "demo-player-02", displayName: "Jordan", points: 980, rank: 3 }],
  ledger: [{ id: "J-1004", reason: "Demo round entry locked", change: -250, balanceAfter: 12500, createdAt: "Today, 14:32" }]
};

type ApiRuntime = { balances: Record<LedgerAccount, number>; state: DemoState };
const fallbackRuntime: ApiRuntime = { balances: baseBalances, state: baseState };
const runtimeStorage = new AsyncLocalStorage<ApiRuntime>();
function activeRuntime(): ApiRuntime { return runtimeStorage.getStore() ?? fallbackRuntime; }
function createRequestRuntime(): ApiRuntime { return { balances: { ...fallbackRuntime.balances }, state: structuredClone(fallbackRuntime.state) }; }
const balances = new Proxy<Record<LedgerAccount, number>>({} as Record<LedgerAccount, number>, {
  get: (_target, property) => activeRuntime().balances[property as LedgerAccount],
  set: (_target, property, value) => { activeRuntime().balances[property as LedgerAccount] = Number(value); return true; }
});
const state = new Proxy<DemoState>({} as DemoState, {
  get: (_target, property) => activeRuntime().state[property as keyof DemoState],
  set: (_target, property, value) => { activeRuntime().state[property as keyof DemoState] = value; return true; }
});

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": process.env.CORS_ORIGIN ?? "http://localhost:4173", "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type, idempotency-key, x-demo-user, x-session-token, x-demo-admin-token", "access-control-allow-methods": "GET, POST, OPTIONS" });
  response.end(status === 204 ? undefined : JSON.stringify(body));
}

function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => data += chunk);
    request.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("Invalid JSON body")); } });
    request.on("error", reject);
  });
}

function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value; }
function allowRateLimit(request: IncomingMessage): boolean { const key = header(request, "x-demo-user") ?? cookie(request, "p12_session") ?? header(request, "x-session-token") ?? "anonymous"; const now = Date.now(); const current = rateLimits.get(key); if (!current || current.resetAt <= now) { rateLimits.set(key, { count: 1, resetAt: now + 60_000 }); return true; } if (current.count >= 60) return false; current.count += 1; return true; }
function cookie(request: IncomingMessage, name: string): string | undefined { return (header(request, "cookie") ?? "").split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.[1]; }
function createDemoSessionToken(userId: string, expiresAt: number): string { const payload = Buffer.from(JSON.stringify({ userId, role: "PLAYER", expiresAt }), "utf8").toString("base64url"); const signature = createHmac("sha256", process.env.SESSION_SECRET ?? "project12-demo-session-fallback").update(payload).digest("base64url"); return `${payload}.${signature}`; }
function verifyDemoSessionToken(token: string): { userId: string; role: "PLAYER" | "ADMIN"; expiresAt: number } | undefined { const [payload, signature] = token.split("."); if (!payload || !signature) return undefined; const expected = createHmac("sha256", process.env.SESSION_SECRET ?? "project12-demo-session-fallback").update(payload).digest("base64url"); if (!safeEqualText(expected, signature)) return undefined; try { const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string; role?: "PLAYER" | "ADMIN"; expiresAt?: number }; const expiresAt = parsed.expiresAt; if (!parsed.userId || parsed.role !== "PLAYER" || typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined; return { userId: parsed.userId, role: parsed.role, expiresAt }; } catch { return undefined; } }
function session(request: IncomingMessage): { userId: string; role: "PLAYER" | "ADMIN" } | undefined {
  const cached = requestSessions.get(request);
  if (cached) return cached;
  const token = cookie(request, "p12_session") ?? (appMode === "demo" ? header(request, "x-session-token") : undefined);
  if (!token) return undefined;
  const current = sessions.get(token);
  if (!current) {
    if (appMode === "demo" && !persistence.configured) { const stateless = verifyDemoSessionToken(token); if (stateless) { requestSessions.set(request, stateless); return stateless; } }
    return undefined;
  }
  if (current.expiresAt <= Date.now()) { sessions.delete(token); return undefined; }
  const identity = { userId: current.userId, role: current.role };
  requestSessions.set(request, identity);
  return identity;
}
async function resolveSession(request: IncomingMessage): Promise<{ userId: string; role: "PLAYER" | "ADMIN" } | undefined> {
  const active = session(request);
  if (active) return active;
  const token = cookie(request, "p12_session");
  if (!token) return undefined;
  const persisted = await persistence.findSession(token);
  if (!persisted || persisted.expiresAt.getTime() <= Date.now()) return undefined;
  const identity = { userId: persisted.userId, role: persisted.role };
  requestSessions.set(request, identity);
  return identity;
}
function requireAdmin(request: IncomingMessage): boolean {
  const configuredToken = process.env.ADMIN_DEMO_TOKEN;
  if (appMode !== "demo" && (!configuredToken || configuredToken === "admin-demo-only")) return false;
  return header(request, "x-demo-admin-token") === (configuredToken ?? "admin-demo-only");
}
function now(): string { return new Date().toISOString(); }
function syncUserBalances() { state.user.available = balances.USER_AVAILABLE; state.user.locked = balances.USER_LOCKED; }
function persistAsync(work: () => Promise<void>): void { void work().catch((error: unknown) => console.error(`database persistence failed: ${error instanceof Error ? error.message : String(error)}`)); }
function audit(actor: string, action: string, referenceType: string, referenceId: string, before?: unknown, after?: unknown) { auditLogs.unshift({ id: `AL-${String(auditLogs.length + 1).padStart(4, "0")}`, actor, action, referenceType, referenceId, before, after, createdAt: now() }); persistAsync(() => persistence.persistAudit({ actor, action, referenceType, referenceId, before, after })); }
function queueOutbox(type: string, payload: Record<string, unknown>) { const event = { id: `OB-${String(outboxEvents.length + 1).padStart(4, "0")}`, type, payload, createdAt: now() }; outboxEvents.unshift(event); persistAsync(() => persistence.persistOutbox(type, payload)); return event; }
function writeRoundEvent(response: ServerResponse, event: typeof roundEvents[number]) { if (response.writableEnded || response.destroyed) return false; try { response.write(`event: round\ndata: ${JSON.stringify(event)}\n\n`); return true; } catch { return false; } }
function broadcastRoundEvent(event: typeof roundEvents[number]) { for (const response of realtimeClients) if (!writeRoundEvent(response, event)) realtimeClients.delete(response); }
function stateDeadline(to: RoundState): Date | null { const seconds: Partial<Record<RoundState, number>> = { BANKER_BIDDING: 30, BETTING: 30, CLAIMING: 45, EVALUATING: 10, SETTLING: 15 }; return seconds[to] === undefined ? null : new Date(Date.now() + seconds[to]! * 1000); }
async function transition(to: RoundState, actor: string, payload: Record<string, unknown> = {}) { const from = state.round.state; assertTransition(from, to); const stateEndsAt = stateDeadline(to); await persistence.persistRoundEvent({ roundId: state.round.id, from, to, stateEndsAt, payload: { ...payload, stateEndsAt: stateEndsAt?.toISOString() ?? null }, actor }); state.round.state = to; const event = { id: `RE-${String(roundEvents.length + 1).padStart(4, "0")}`, roundId: state.round.id, from, to, payload, createdAt: now() }; roundEvents.unshift(event); queueOutbox("ROUND_STATE_CHANGED", { ...event }); audit(actor, "ROUND_STATE_CHANGED", "ROUND", state.round.id, { state: from }, { state: to, ...payload }); broadcastRoundEvent(event); return event; }
async function writeIdempotent(request: IncomingMessage, response: ServerResponse, work: (key: string) => unknown | Promise<unknown>) { const key = header(request, "idempotency-key"); if (!key) return json(response, 400, { error: "Idempotency-Key is required for writes" }); const persisted = await persistence.getIdempotency(key); if (persisted !== undefined) return json(response, 200, { replayed: true, result: persisted }); if (idempotency.has(key)) return json(response, 200, { replayed: true, result: idempotency.get(key) }); const result = await work(key); idempotency.set(key, result); await persistence.putIdempotency(key, session(request)?.userId ?? "anonymous", result); return json(response, 200, { replayed: false, result }); }
function createSettlementJournal(idempotencyKey: string, result: ReturnType<typeof settlePlayer>): Journal {
  const stake = result.stake;
  const grossReward = result.grossReward;
  const fee = result.fee;
  const lines = result.outcome === "WIN"
    ? [{ account: "USER_LOCKED" as const, direction: "DEBIT" as const, amount: stake }, { account: "BANKER_POOL" as const, direction: "DEBIT" as const, amount: grossReward }, { account: "USER_AVAILABLE" as const, direction: "CREDIT" as const, amount: stake + grossReward - fee }, { account: "PLATFORM_FEE" as const, direction: "CREDIT" as const, amount: fee }]
    : result.outcome === "LOSE"
      ? [{ account: "USER_LOCKED" as const, direction: "DEBIT" as const, amount: stake }, { account: "BANKER_POOL" as const, direction: "CREDIT" as const, amount: stake - fee }, { account: "PLATFORM_FEE" as const, direction: "CREDIT" as const, amount: fee }]
      : [{ account: "USER_LOCKED" as const, direction: "DEBIT" as const, amount: stake }, { account: "USER_AVAILABLE" as const, direction: "CREDIT" as const, amount: stake }];
  const journal: Journal = { id: "J-1005", referenceType: "ROUND_SETTLEMENT", referenceId: state.round.id, idempotencyKey, reason: `Round settlement · ${result.outcome} · demo only`, lines: lines.filter((line) => line.amount > 0) };
  assertBalanced(journal); return journal;
}
function createRefundJournal(idempotencyKey: string, amount: number): Journal { const journal = createTransferJournal({ id: "J-1006", referenceType: "ROUND_REFUND", referenceId: state.round.id, idempotencyKey, reason: "Cancelled demo round refund", from: "USER_LOCKED", to: "USER_AVAILABLE", amount }); assertBalanced(journal); return journal; }
function rejectMoney(response: ServerResponse) { return json(response, 403, { code: realMoneyDisabled ? "REAL_MONEY_DISABLED" : "PROVIDER_APPROVAL_REQUIRED", message: "Real-money operations are unavailable in this demo." }); }
function requirePlayer(request: IncomingMessage, response: ServerResponse): { userId: string; role: "PLAYER" | "ADMIN" } | undefined { const identity = session(request); if (!identity) { json(response, 401, { error: "Unauthorized" }); return undefined; } return identity; }
function onboardingState(userId: string) { const current = onboarding.get(userId) ?? { deviceBound: false, referrerBound: false, pinSet: false }; onboarding.set(userId, current); return current; }
async function hydrateRuntime(runtime: ApiRuntime): Promise<void> { if (!persistence.configured) return; const snapshot = await persistence.loadRoundRuntime(); if (snapshot) { runtime.state.round.state = snapshot.state; runtime.state.round.banker = snapshot.bankerUserId ?? runtime.state.round.banker; runtime.state.round.bankPool = snapshot.bankerPool; runtime.balances.BANKER_POOL = snapshot.bankerPool; } }
async function hydrateUserRuntime(userId: string, runtime = activeRuntime()): Promise<void> {
  const snapshot = await persistence.loadUserRuntime(userId);
  if (!snapshot) return;
  runtime.balances.USER_AVAILABLE = snapshot.available;
  runtime.balances.USER_LOCKED = snapshot.locked;
  runtime.balances.BANKER_POOL = snapshot.bankerPool;
  runtime.state.user = { ...runtime.state.user, id: userId, displayName: snapshot.displayName, available: snapshot.available, locked: snapshot.locked };
  runtime.state.round.bankPool = snapshot.bankerPool;
  if (snapshot.ledger.length > 0) runtime.state.ledger = snapshot.ledger;
  onboarding.set(userId, snapshot.onboarding);
}

async function workerHealth(): Promise<{ status: "healthy" | "mock" | "unavailable"; workerId?: string; heartbeatAt?: string }> {
  if (appMode === "demo" && !persistence.configured) return { status: "mock" };
  const heartbeat = await persistence.latestWorkerHeartbeat();
  if (!heartbeat) return { status: "unavailable" };
  const age = Date.now() - Date.parse(heartbeat.heartbeatAt);
  return age <= Number(process.env.WORKER_HEARTBEAT_TIMEOUT_MS ?? 45_000) ? { status: "healthy", workerId: heartbeat.workerId, heartbeatAt: heartbeat.heartbeatAt } : { status: "unavailable", workerId: heartbeat.workerId, heartbeatAt: heartbeat.heartbeatAt };
}

function telegramUpdateType(update: Record<string, unknown>): "message" | "callback_query" | "my_chat_member" | "unknown" {
  if (update.message) return "message";
  if (update.callback_query) return "callback_query";
  if (update.my_chat_member) return "my_chat_member";
  return "unknown";
}

export const apiHandler = async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    response.setHeader("x-request-id", header(request, "x-request-id") ?? randomBytes(12).toString("hex"));
    if (request.method === "OPTIONS") return json(response, 204, {});
    if (request.method === "POST" && !allowRateLimit(request)) return json(response, 429, { error: "Rate limit exceeded" });
    const healthPath = url.pathname.replace(/^\/api(?=\/|$)/, "");
    const activeSession = await resolveSession(request);
    const runtime = persistence.configured && activeSession ? createRequestRuntime() : fallbackRuntime;
    if (!healthPath.startsWith("/health")) await hydrateRuntime(runtime);
    return runtimeStorage.run(runtime, async () => {
    if (activeSession) await hydrateUserRuntime(activeSession.userId, runtime);
    if (request.method === "GET" && healthPath === "/health/live") return json(response, 200, { ok: true, service: "api", mode: appMode });
    if (request.method === "GET" && healthPath === "/health/worker") { const worker = await workerHealth(); return json(response, worker.status === "unavailable" ? 503 : 200, { ok: worker.status !== "unavailable", service: "worker", ...worker }); }
    if (request.method === "GET" && (healthPath === "/health/ready" || healthPath === "/health")) { const databaseHealth = await persistence.health(); const worker = await workerHealth(); const botConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN); const workerRequired = process.env.REQUIRE_WORKER === "true"; const ready = appMode === "demo" ? true : databaseHealth === "healthy" && botConfigured && (!workerRequired || worker.status === "healthy"); return json(response, ready ? 200 : 503, { ok: ready, mode: appMode, realMoneyDisabled, services: { api: ready ? "healthy" : "degraded", worker: worker.status, workerRequired, bot: botConfigured ? "configured" : "blocked", ledger: "balanced", packetProvider: packetProvider.status, database: databaseHealth }, auth: { telegramSignedDataRequiredOutsideDemo: true, mockEnabled: telegramMockEnabled } }); }

    if (request.method === "POST" && url.pathname === "/api/auth/telegram") { if (appMode !== "demo" && !persistence.configured) return json(response, 503, { code: "DATABASE_REQUIRED", error: "Persistent authentication storage is not configured" }); const data = await body(request); let identity: { userId: string; username?: string }; let mode: "telegram-verified" | "mock"; if (process.env.TELEGRAM_BOT_TOKEN && typeof data.initData === "string" && data.initData.trim()) { identity = validateTelegramInitData(data.initData, process.env.TELEGRAM_BOT_TOKEN, Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ?? 86400)); mode = "telegram-verified"; } else if (typeof data.launchToken === "string" && data.launchToken.trim()) { const launchUserId = await persistence.consumeWebAppLaunchGrant(data.launchToken.trim()); if (!launchUserId) return json(response, 401, { code: "INVALID_LAUNCH_GRANT", error: "This Telegram launch button has expired or was already used" }); identity = { userId: launchUserId }; mode = "telegram-verified"; } else if (telegramMockEnabled) { identity = { userId: typeof data.demoUser === "string" ? data.demoUser : "demo-player-01", username: "demo_player" }; mode = "mock"; } else return json(response, 503, { code: "TELEGRAM_SIGNED_INIT_DATA_REQUIRED", error: "Signed Telegram initData or a valid Telegram launch grant is required outside demo mode" }); const expiresAt = Date.now() + 86_400_000; const token = appMode === "demo" && !persistence.configured ? createDemoSessionToken(identity.userId, expiresAt) : randomBytes(32).toString("hex"); sessions.set(token, { userId: identity.userId, role: "PLAYER", expiresAt }); await persistence.upsertTelegramIdentity(identity.userId, identity.username, mode === "telegram-verified"); await persistence.createSession(identity.userId, token, new Date(expiresAt)); const startParam = typeof data.startParam === "string" ? data.startParam.trim() : ""; const pendingReferral = startParam.replace(/^ref_/, ""); const onboardingEntry = onboardingState(identity.userId); if (pendingReferral) onboardingEntry.pendingReferral = pendingReferral; const secureSession = appMode !== "demo" || process.env.NODE_ENV === "production"; response.setHeader("set-cookie", `p12_session=${token}; HttpOnly; SameSite=${secureSession ? "None" : "Lax"}; Path=/; Max-Age=86400${secureSession ? "; Secure" : ""}`); return json(response, 200, { token: appMode === "demo" ? token : undefined, mode, user: { id: identity.userId, username: identity.username }, startParam, session: "HttpOnly cookie", persistence: persistence.configured ? "postgres" : "memory-demo-fallback" }); }
    if (request.method === "GET" && url.pathname === "/api/me") return session(request) ? json(response, 200, state.user) : json(response, 401, { error: "Unauthorized" });
    if (request.method === "GET" && url.pathname === "/api/onboarding/status") { const identity = requirePlayer(request, response); return identity ? json(response, 200, onboardingState(identity.userId)) : undefined; }
    if (request.method === "POST" && url.pathname === "/api/onboarding/device-bind") { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const data = await body(request); const publicKey = typeof data.publicKey === "string" ? data.publicKey.trim() : ""; if (publicKey.length < 32) throw new Error("Device public key is required"); const existing = deviceBindings.get(publicKey); if (existing && existing.userId !== identity.userId) throw new Error("Device is already bound to another account"); const current = onboardingState(identity.userId); if (!existing) deviceBindings.set(publicKey, { userId: identity.userId, publicKey, boundAt: now() }); await persistence.persistDevice(identity.userId, publicKey); current.deviceBound = true; audit(identity.userId, "DEVICE_BOUND", "DEVICE", createHash("sha256").update(publicKey).digest("hex").slice(0, 16), undefined, { idempotencyKey: key, keyType: "public-key" }); return { status: "BOUND", deviceBound: true, devicePublicKey: publicKey }; }); }
    if (request.method === "POST" && url.pathname === "/api/onboarding/referrer") { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const data = await body(request); const current = onboardingState(identity.userId); const code = (typeof data.code === "string" ? data.code.trim() : "") || current.pendingReferral || ""; if (!code) throw new Error("Referral code is required"); if (current.referrerBound) return { status: "ALREADY_BOUND" }; const known = code === "DEMO-INVITE" || /^P12-DEMO-\d{2}$/.test(code); if (!known) throw new Error("Referral code not found"); current.referrerBound = true; current.pendingReferral = undefined; referralEdges.push({ referrerUserId: code === "DEMO-INVITE" ? "demo-referrer-01" : code, referredUserId: identity.userId, code, status: "PENDING", source: "ONBOARDING" }); await persistence.persistReferral(identity.userId, code, "ONBOARDING"); audit(identity.userId, "ONBOARDING_REFERRER_BOUND", "REFERRAL", identity.userId, undefined, { code, idempotencyKey: key }); return { status: "BOUND", referrerBound: true, code }; }); }
    if (request.method === "POST" && url.pathname === "/api/onboarding/pin") { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const data = await body(request); if (!validPin(data.pin)) throw new Error("PIN must be six digits and not a repeated or sequential demo PIN"); const current = onboardingState(identity.userId); const encodedHash = await hashPin(data.pin); securityPins.set(identity.userId, { hash: encodedHash, changedAt: now() }); await persistence.persistPin(identity.userId, encodedHash); current.pinSet = true; audit(identity.userId, "SECURITY_PIN_SET", "USER", identity.userId, undefined, { idempotencyKey: key, algorithm: "scrypt" }); return { status: "SET", pinSet: true }; }); }
    if (request.method === "GET" && url.pathname === "/api/rooms") return json(response, 200, [{ id: "room-12", name: "Project 12 Social Table", players: state.round.players, state: state.round.state, roundId: state.round.id, banker: state.round.banker, bankPool: state.round.bankPool, endsAt: state.round.endsAt, minDemoCredit: 250 }]);
    if (request.method === "GET" && url.pathname === "/api/rooms/room-12") return json(response, 200, { id: "room-12", name: "Project 12 Social Table", players: state.round.players, state: state.round.state, roundId: state.round.id, minDemoCredit: 250 });
    if (request.method === "POST" && url.pathname === "/api/rooms/room-12/join") { const identity = requirePlayer(request, response); return identity ? writeIdempotent(request, response, () => { audit(identity.userId, "ROOM_JOINED", "ROOM", "room-12"); return { roomId: "room-12", roundId: state.round.id, joined: true, label: "DEMO PLAYER" }; }) : undefined; }
    if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}`) return json(response, 200, state.round);
    if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/events`) return json(response, 200, roundEvents);
    if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/realtime`) { response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": process.env.CORS_ORIGIN ?? "http://localhost:4173", "access-control-allow-credentials": "true" }); for (const event of [...roundEvents].reverse()) writeRoundEvent(response, event); response.write(`event: snapshot\ndata: ${JSON.stringify({ round: state.round, outboxPending: outboxEvents.filter((event) => !event.publishedAt).length })}\n\n`); if (url.searchParams.get("snapshot") === "1") { response.end(); return; } realtimeClients.add(response); const heartbeat = setInterval(() => { if (!response.writableEnded && !response.destroyed) response.write(": heartbeat\n\n"); }, 15_000); response.on("close", () => { clearInterval(heartbeat); realtimeClients.delete(response); }); return; }
    if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/fairness`) return json(response, 200, { ruleVersion: demoRules.id, seedHash: hashSeed(serverSeed), revealed: ["ROUND_COMPLETE", "REFUNDED"].includes(state.round.state), serverSeed: ["ROUND_COMPLETE", "REFUNDED"].includes(state.round.state) ? serverSeed : undefined, inputTemplate: `${state.round.id}:<userId>:<claimSequence>` });
    if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/settlement`) return json(response, 200, { roundId: state.round.id, state: state.round.state, ledger: state.ledger.slice(0, 5), events: roundEvents.slice(0, 10), demoOnly: true });
    if (request.method === "GET" && url.pathname === "/api/admin/outbox") return requireAdmin(request) ? json(response, 200, outboxEvents) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "POST" && url.pathname === "/api/admin/outbox/publish") return requireAdmin(request) ? writeIdempotent(request, response, (key) => { const published = outboxEvents.filter((event) => !event.publishedAt).map((event) => { event.publishedAt = now(); return event.id; }); audit("admin", "OUTBOX_PUBLISHED", "OUTBOX", key, undefined, { count: published.length }); return { published }; }) : json(response, 403, { error: "Admin authorization required" });

    if (request.method === "POST" && url.pathname === `/api/rounds/${state.round.id}/bid`) { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const data = await body(request); const amount = Number(data.amount ?? 100); if (!Number.isInteger(amount) || amount <= 0) throw new Error("Bid must be a positive integer"); if (state.round.state !== "BANKER_BIDDING") throw new Error("Banker bidding is closed"); await persistence.persistBankerBid(identity.userId, amount); const currentHighest = 500; const banker = amount > currentHighest ? identity.userId : "demo-banker-01"; state.round.banker = banker; if (banker === identity.userId) state.user.role = "BANKER"; await transition("BETTING", identity.userId, { amount, currentHighest, banker, idempotencyKey: key, bankerConfirmedAt: now() }); return { state: state.round.state, banker, amount, currentHighest }; }); }
    if (request.method === "POST" && url.pathname === `/api/rounds/${state.round.id}/bet`) { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const data = await body(request); const amount = Number(data.amount ?? 250); if (!Number.isInteger(amount) || amount <= 0) throw new Error("Bet amount must be a positive integer"); if (state.round.state !== "BETTING") throw new Error("Betting is closed"); if (state.user.role === "BANKER") throw new Error("Bankers cannot place player bets"); const journal = createTransferJournal({ id: "J-1004", referenceType: "BET_LOCK", referenceId: state.round.id, idempotencyKey: key, reason: "Lock demo bet", from: "USER_AVAILABLE", to: "USER_LOCKED", amount }); const packet = await packetProvider.createPacket({ roundId: state.round.id, amount, serverSeedHash: hashSeed(serverSeed) }); packetIds.set(state.round.id, packet.id); Object.assign(balances, applyJournal(balances, journal)); await persistence.persistBet(identity.userId, amount); await persistence.persistPacket(packet.provider, hashSeed(serverSeed)); await persistence.persistJournal(journal, identity.userId); syncUserBalances(); await transition("PACKET_SENT", identity.userId, { amount, acceptedAt: now(), packetId: packet.id, packetMode: "INTERNAL" }); await transition("CLAIMING", identity.userId); state.round.endsAt = "00:18"; state.ledger.unshift({ id: journal.id, reason: journal.reason, change: -amount, balanceAfter: state.user.available, createdAt: "Just now" }); audit(identity.userId, "BET_LOCKED", "JOURNAL", journal.id, undefined, { journal, packet }); return { state: state.round.state, locked: state.user.locked, journal, packet }; }); }
    if (request.method === "POST" && [`/api/rounds/${state.round.id}/packet-claim`, `/api/rounds/${state.round.id}/demo-claim`].includes(url.pathname)) { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { if (!realMoneyDisabled) throw new Error("Unexpected money mode"); if (packetProvider.status !== "DEMO_READY") throw new Error(`Packet provider unavailable: ${packetProvider.name}`); if (!["CLAIMING", "EVALUATING"].includes(state.round.state)) throw new Error("Claim window is closed"); const packetId = packetIds.get(state.round.id) ?? (await packetProvider.createPacket({ roundId: state.round.id, amount: 250 })).id; packetIds.set(state.round.id, packetId); const claim = await packetProvider.claim({ packetId, serverSeed, roundId: state.round.id, userId: identity.userId, claimSequence: 1 }); await persistence.persistPacketClaim(identity.userId, 1, claim.value); if (state.round.state === "CLAIMING") await transition("EVALUATING", identity.userId, { claimSequence: 1, claimedAt: claim.claimedAt, idempotencyKey: key }); state.round.endsAt = "Done"; const hand = classifyHand([3, 4, 2]); audit(identity.userId, "INTERNAL_PACKET_CLAIMED", "ROUND", state.round.id, undefined, claim); return { ...claim, hand }; }); }
    if (request.method === "POST" && url.pathname === `/api/rounds/${state.round.id}/settle`) { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { if (state.round.state !== "EVALUATING") throw new Error("Round is not ready to settle"); const amountLocked = balances.USER_LOCKED; if (amountLocked <= 0) throw new Error("No locked demo bet to settle"); const result = settlePlayer({ stake: amountLocked, player: { type: "普通点数", points: 9, amount: 3.42 }, banker: { type: "普通点数", points: 8, amount: 2.22 }, bankerPool: balances.BANKER_POOL }); const journal = createSettlementJournal(key, result); await transition("SETTLING", identity.userId, { journalId: journal.id, outcome: result.outcome }); Object.assign(balances, applyJournal(balances, journal)); await persistence.persistHand(identity.userId, 9, "普通点数", [3, 4, 2]); await persistence.persistSettlement(identity.userId, result.outcome); await persistence.persistJournal(journal, identity.userId); syncUserBalances(); await transition("ROUND_COMPLETE", identity.userId, { journalId: journal.id, outcome: result.outcome }); state.round.bankPool = balances.BANKER_POOL; const balanceChange = journal.lines.filter((line) => line.account === "USER_AVAILABLE" && line.direction === "CREDIT").reduce((sum, line) => sum + line.amount, 0); state.ledger.unshift({ id: journal.id, reason: journal.reason, change: balanceChange, balanceAfter: state.user.available, createdAt: "Just now" }); const mission = state.missions.find((item) => item.id === "rounds"); if (mission) mission.progress = Math.min(mission.target, mission.progress + 1); const player = state.leaderboard?.find((item) => item.userId === state.user.id); if (player) player.points += Math.round(result.netReward); audit(identity.userId, "ROUND_SETTLED", "JOURNAL", journal.id, undefined, { journal, result }); return { state: state.round.state, outcome: result.outcome, settlement: result, journal }; }); }
    if (request.method === "POST" && url.pathname === `/api/rounds/${state.round.id}/cancel`) { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { if (!["BETTING", "PACKET_SENT", "CLAIMING", "EVALUATING"].includes(state.round.state)) throw new Error("Round cannot be cancelled in its current state"); await transition("ROUND_CANCELLED", identity.userId, { reason: "demo cancellation" }); const packetId = packetIds.get(state.round.id); if (packetId) await packetProvider.cancelPacket(packetId); let journal: Journal | undefined; if (balances.USER_LOCKED > 0) { await transition("REFUNDING", identity.userId); journal = createRefundJournal(key, balances.USER_LOCKED); Object.assign(balances, applyJournal(balances, journal)); await persistence.persistJournal(journal, identity.userId); syncUserBalances(); state.ledger.unshift({ id: journal.id, reason: journal.reason, change: journal.lines[1].amount, balanceAfter: state.user.available, createdAt: "Just now" }); audit(identity.userId, "ROUND_REFUNDED", "JOURNAL", journal.id, undefined, journal); } await transition("REFUNDED", identity.userId); return { state: state.round.state, journal, refunded: true, packetCancelled: Boolean(packetId) }; }); }

    if (request.method === "GET" && url.pathname === "/api/wallet") { const identity = requirePlayer(request, response); return identity ? json(response, 200, { available: state.user.available, locked: state.user.locked, label: "DEMO CREDIT · NO CASH VALUE" }) : undefined; }
    if (request.method === "GET" && url.pathname === "/api/wallet/ledger") { const identity = requirePlayer(request, response); return identity ? json(response, 200, state.ledger) : undefined; }
    if (request.method === "GET" && url.pathname === "/api/missions") return json(response, 200, state.missions);
    if (request.method === "POST" && url.pathname.startsWith("/api/missions/") && url.pathname.endsWith("/claim")) { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const missionId = url.pathname.split("/")[3]; const mission = state.missions.find((item) => item.id === missionId); if (!mission) throw new Error("Mission not found"); if (mission.progress < mission.target) throw new Error("Mission is not complete"); if (rewardClaims.has(missionId)) return { missionId, status: "ALREADY_CLAIMED" }; const journal = createTransferJournal({ id: `J-${missionId.toUpperCase()}`, referenceType: "MISSION_REWARD", referenceId: missionId, idempotencyKey: key, reason: "Demo mission reward", from: "DEMO_GRANTS", to: "USER_AVAILABLE", amount: mission.reward }); Object.assign(balances, applyJournal(balances, journal)); await persistence.persistJournal(journal, identity.userId); syncUserBalances(); rewardClaims.add(missionId); state.ledger.unshift({ id: journal.id, reason: journal.reason, change: mission.reward, balanceAfter: state.user.available, createdAt: "Just now" }); audit(identity.userId, "MISSION_REWARD_CLAIMED", "MISSION", missionId, undefined, journal); return { missionId, reward: mission.reward, status: "CLAIMED", journal }; }); }
    if (request.method === "GET" && url.pathname === "/api/referrals") { const identity = requirePlayer(request, response); return identity ? json(response, 200, { ...state.referrals, bound: referralEdges.find((edge) => edge.referredUserId === identity.userId) ?? null }) : undefined; }
    if (request.method === "POST" && url.pathname === "/api/referrals/bind") { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async () => { const data = await body(request); const code = typeof data.code === "string" ? data.code.trim() : ""; if (!code) throw new Error("Referral code is required"); if (code === state.referrals.code) throw new Error("Self-referral is not allowed"); if (referralEdges.some((edge) => edge.referredUserId === identity.userId)) return { status: "ALREADY_BOUND" }; if (code !== "DEMO-INVITE") throw new Error("Referral code not found"); const edge = { referrerUserId: "demo-referrer-01", referredUserId: identity.userId, code, status: "PENDING" as const, source: "MANUAL" }; referralEdges.push(edge); audit(identity.userId, "REFERRAL_BOUND", "REFERRAL", identity.userId, undefined, edge); return { status: "BOUND", edge }; }); }
    if (request.method === "GET" && url.pathname === "/api/referrals/tree") return json(response, 200, { root: state.user.id, children: [{ id: "demo-ref-01", status: "QUALIFIED" }, { id: "demo-ref-02", status: "PENDING" }] });
    if (request.method === "GET" && url.pathname === "/api/leaderboard") return json(response, 200, state.leaderboard ?? []);
    if (request.method === "POST" && ["/api/wallet/top-up", "/api/wallet/withdraw", "/api/payments/charge", "/api/rewards/cash-out"].includes(url.pathname)) return rejectMoney(response);

    if (request.method === "GET" && url.pathname === "/api/admin/users") return requireAdmin(request) ? json(response, 200, [{ id: state.user.id, displayName: state.user.displayName, riskStatus: state.user.riskStatus, available: state.user.available, locked: state.user.locked }]) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === "/api/admin/rounds") return requireAdmin(request) ? json(response, 200, [state.round]) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === `/api/admin/rounds/${state.round.id}/reconstruct`) return requireAdmin(request) ? json(response, 200, { round: state.round, ruleVersion: demoRules, events: [...roundEvents].reverse(), claims: await packetProvider.getClaims(packetIds.get(state.round.id) ?? ""), fairness: { seedHash: hashSeed(serverSeed), serverSeed: ["ROUND_COMPLETE", "REFUNDED"].includes(state.round.state) ? serverSeed : undefined }, ledger: state.ledger, outbox: outboxEvents }) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === "/api/admin/ledger") return requireAdmin(request) ? json(response, 200, state.ledger) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === "/api/admin/audit-logs") return requireAdmin(request) ? json(response, 200, auditLogs) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === "/api/admin/risk-flags") return requireAdmin(request) ? json(response, 200, riskFlags) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "POST" && url.pathname === "/api/admin/risk-flags") return requireAdmin(request) ? writeIdempotent(request, response, async (key) => { const data = await body(request); const reason = typeof data.reason === "string" ? data.reason.trim() : ""; if (!reason) throw new Error("Risk reason is required"); const flag = { id: `RF-${String(riskFlags.length + 20).padStart(3, "0")}`, userId: typeof data.userId === "string" ? data.userId : undefined, roundId: typeof data.roundId === "string" ? data.roundId : undefined, status: "OPEN" as const, reason, createdAt: now() }; riskFlags.unshift(flag); audit("admin", "RISK_FLAG_CREATED", "RISK_FLAG", flag.id, undefined, { ...flag, ticketId: data.ticketId, idempotencyKey: key }); return flag; }) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "POST" && url.pathname === "/api/admin/adjustments") return requireAdmin(request) ? writeIdempotent(request, response, async (key) => { const data = await body(request); const amount = Number(data.amount); const reason = typeof data.reason === "string" ? data.reason.trim() : ""; const ticketId = typeof data.ticketId === "string" ? data.ticketId.trim() : ""; if (!Number.isInteger(amount) || amount === 0 || !reason || !ticketId) throw new Error("Adjustment requires non-zero integer amount, reason and ticketId"); const id = `ADJ-${String(adjustments.size + 1).padStart(4, "0")}`; const adjustment = { id, amount, reason, ticketId, createdBy: header(request, "x-demo-admin-user") ?? "admin-1", status: "PENDING_APPROVAL" as const }; adjustments.set(id, adjustment); audit(adjustment.createdBy, "ADJUSTMENT_REQUESTED", "ADJUSTMENT", id, undefined, { ...adjustment, idempotencyKey: key }); return adjustment; }) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "POST" && url.pathname.startsWith("/api/admin/adjustments/") && url.pathname.endsWith("/approve")) return requireAdmin(request) ? writeIdempotent(request, response, (key) => { const id = url.pathname.split("/")[4]; const adjustment = adjustments.get(id); if (!adjustment) throw new Error("Adjustment not found"); const approver = header(request, "x-demo-admin-user") ?? "admin-2"; if (adjustment.createdBy === approver) throw new Error("A second admin approval is required"); if (adjustment.status !== "PENDING_APPROVAL") return adjustment; adjustment.approvedBy = approver; adjustment.status = "APPROVED"; audit(approver, "ADJUSTMENT_APPROVED", "ADJUSTMENT", id, { status: "PENDING_APPROVAL" }, { ...adjustment, idempotencyKey: key }); return adjustment; }) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === "/api/admin/campaigns") return requireAdmin(request) ? json(response, 200, [{ id: "campaign-demo-01", name: "Daily Banker Count", status: "ACTIVE", version: 2 }]) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "POST" && url.pathname === "/api/admin/campaigns") return requireAdmin(request) ? writeIdempotent(request, response, (key) => { const result = { id: "campaign-draft-demo", status: "DRAFT", idempotencyKey: key }; audit("admin", "CAMPAIGN_DRAFT_CREATED", "CAMPAIGN", result.id, undefined, result); return result; }) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "POST" && url.pathname.startsWith("/api/admin/disputes/") && url.pathname.endsWith("/resolve")) return requireAdmin(request) ? writeIdempotent(request, response, (key) => { const id = url.pathname.split("/")[4]; const result = { id, status: "RESOLVED", auditRequired: true, idempotencyKey: key }; audit("admin", "DISPUTE_RESOLVED", "DISPUTE", id, { status: "OPEN" }, result); return result; }) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "POST" && url.pathname === `/api/admin/rounds/${state.round.id}/transition`) return requireAdmin(request) ? writeIdempotent(request, response, async (key) => { const data = await body(request); const to = data.to as RoundState; if (!to) throw new Error("Target state is required"); const event = await transition(to, "admin", { idempotencyKey: key, reason: "operator demo transition" }); return { event, state: state.round.state }; }) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "POST" && url.pathname === "/api/telegram/webhook") {
      const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
      const received = header(request, "x-telegram-bot-api-secret-token");
      if (appMode !== "demo" && !expected) return json(response, 503, { code: "WEBHOOK_SECRET_REQUIRED", error: "Telegram webhook secret is not configured" });
      if (expected && !safeEqualText(expected, received)) return json(response, 401, { code: "AUTHORIZATION_REQUIRED", error: "Telegram webhook secret mismatch" });
      if (appMode !== "demo" && !persistence.configured) return json(response, 503, { code: "DATABASE_REQUIRED", error: "Persistent webhook storage is not configured" });
      const update = await body(request);
      const updateId = Number(update.update_id);
      const updateType = telegramUpdateType(update);
      if (!Number.isSafeInteger(updateId) || updateId < 0) return json(response, 400, { code: "INVALID_TELEGRAM_UPDATE", error: "Telegram update_id is required" });
      if (updateType === "unknown") return json(response, 400, { code: "UNSUPPORTED_TELEGRAM_UPDATE", error: "Supported Telegram update payload is required" });
      if (webhookUpdateIds.has(updateId)) return json(response, 200, { ok: true, duplicate: true, updateId });
      const inserted = await persistence.enqueueTelegramUpdate(updateId, updateType, update);
      if (!inserted) return json(response, 200, { ok: true, duplicate: true, updateId });
      webhookUpdateIds.add(updateId);
      outboxEvents.unshift({ id: `TG-${updateId}`, type: "TELEGRAM_UPDATE_RECEIVED", payload: { updateId, updateType }, createdAt: now() });
      return json(response, 200, { ok: true, accepted: true, updateId, updateType });
    }
    return json(response, 404, { error: "Not found" });
    });
  } catch (error) { if (error instanceof PacketProviderError) return json(response, error.code === "AUTHORIZATION_REQUIRED" ? 401 : 503, { code: error.code, error: error.message }); if (error instanceof Error && error.message.startsWith("ROUND_STATE_CONFLICT:")) return json(response, 409, { code: "ROUND_STATE_CONFLICT", error: error.message }); return json(response, 400, { error: error instanceof Error ? error.message : "Request failed" }); }
};

const server = createServer(apiHandler);
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, "0.0.0.0", () => console.log(`Project 12 API listening on ${port}`));
}
