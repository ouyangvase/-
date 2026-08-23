import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { assertTransition, chooseBanker, classifyHand, classifyPacket, demoRoundHand, demoRules, hashSeed, settlePlayer } from "../../../packages/game-engine/src/index.js";
import { applyJournal, assertBalanced, createTransferJournal, type Journal, type LedgerAccount } from "../../../packages/ledger/src/index.js";
import { safeEqualText, validateTelegramInitData } from "../../../packages/telegram/src/index.js";
import { supportedLocales as launchLocales, type Locale } from "@project12/i18n";
import type { DemoState, RoundState } from "@project12/contracts";
import { createPacketProvider, PacketProviderError } from "./providers/packet-provider.js";
import { ApiPersistence, type RoomMessage, type VerificationSnapshot } from "./persistence.js";
import { hashPin, validPin } from "./runtime-security.js";
import { maskTngAccount } from "./verification-security.js";
import { runWorkerTick } from "../../worker/src/worker.js";

const port = Number(process.env.API_PORT ?? 8787);
const appMode = process.env.NODE_ENV === "production" ? "production" : process.env.APP_MODE ?? (process.env.NODE_ENV === "test" ? "demo" : "production");
const telegramMockEnabled = appMode === "demo" && process.env.TELEGRAM_MOCK_ENABLED !== "false";
const realMoneyDisabled = process.env.REAL_MONEY_ENABLED !== "true";
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.APP_VERSION ?? "0.1.0";
const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "local";
const deployedAt = process.env.VERCEL_DEPLOYMENT_CREATED_AT ?? new Date().toISOString();
const persistence = new ApiPersistence();
const requiredProductionConfig = [
  "DATABASE_URL",
  "TELEGRAM_BOT_TOKEN",
  "PROJECT12_SERVER_SEED",
  "TELEGRAM_WEBHOOK_SECRET",
  "SESSION_SECRET",
  "ADMIN_SESSION_SECRET",
  "DEVICE_TOKEN_SECRET",
  "INTERNAL_WORKER_SECRET"
] as const;
function missingProductionConfig(): string[] { return appMode === "demo" ? [] : requiredProductionConfig.filter((name) => !process.env[name]?.trim()); }
const sessions = new Map<string, { userId: string; role: "PLAYER" | "ADMIN"; expiresAt: number }>();
const requestSessions = new WeakMap<IncomingMessage, { userId: string; role: "PLAYER" | "ADMIN" }>();
const idempotency = new Map<string, unknown>();
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const baseBalances: Record<LedgerAccount, number> = { USER_AVAILABLE: 12500, USER_LOCKED: 0, USER_LOCKED_BANKER_POOL: 0, BANKER_POOL: 4800, PLATFORM_FEE: 0, DEMO_GRANTS: 0, CAMPAIGN_REWARD_RESERVE: 12630, PENDING_ADJUSTMENT: 0 };
const auditLogs: Array<{ id: string; actor: string; action: string; referenceType: string; referenceId: string; before?: unknown; after?: unknown; createdAt: string }> = [];
const roundEvents: Array<{ id: string; roundId: string; from?: RoundState; to: RoundState; payload: Record<string, unknown>; createdAt: string }> = [];
const realtimeClients = new Set<ServerResponse>();
const roomRealtimeClients = new Map<ServerResponse, string>();
const responseCorsOrigins = new WeakMap<ServerResponse, string>();
type AppLocale = Locale;
const supportedLocales = new Set<AppLocale>(launchLocales);
const preferredLocales = new Map<string, AppLocale>();
const rewardClaims = new Set<string>();
const dailyRewardClaims = new Set<string>();
const referralEdges: Array<{ referrerUserId: string; referredUserId: string; code: string; status: "PENDING" | "QUALIFIED"; source: string }> = [];
const deviceBindings = new Map<string, { userId: string; publicKey: string; fingerprint?: string; boundAt: string }>();
const securityPins = new Map<string, { hash: string; changedAt: string }>();
const onboarding = new Map<string, { deviceBound: boolean; referrerBound: boolean; pinSet: boolean; pendingReferral?: string }>();
const verificationStates = new Map<string, VerificationSnapshot>();
const demoVerifiedUserId = "demo-player-01";
const roomMessages: RoomMessage[] = [
  { id: "MSG-0001", messageSeq: 1, type: "SYSTEM", body: "平台通知：本房间使用平台内部红包，只有本局下注玩家会收到领取入口。", createdAt: now(), payload: { pinned: true } },
  { id: "MSG-0002", messageSeq: 2, type: "ROUND", body: "平台通知：回合 R-0247 已开启，等待玩家抢庄。", createdAt: now(), payload: { roundId: "R-0247", pinned: true } },
  { id: "MSG-0003", messageSeq: 3, type: "BANKER", body: "平台通知：开始抢庄，玩家发送整数庄金，结束后最高者成为庄家。", createdAt: now(), payload: { templateKey: "game.banker.started", pinned: true } }
];
let nextDemoMessageSeq = roomMessages.reduce((highest, message) => Math.max(highest, message.messageSeq ?? 0), 0);
const outboxEvents: Array<{ id: string; type: string; payload: Record<string, unknown>; createdAt: string; publishedAt?: string }> = [];
const webhookUpdateIds = new Set<number>();
const packetIds = new Map<string, string>();
const roundBettors = new Map<string, Map<string, number>>();
const bankerBids = new Map<string, Array<{ userId: string; amount: number; serverReceivedAt: string }>>();
type RoundResultRow = {
  userId: string;
  betAmount: number;
  packetValue: number;
  hand: ReturnType<typeof classifyPacket>["hand"];
  outcome?: "WIN" | "LOSE" | "TIE" | "WATERED";
  multiplier: number;
  grossReward: number;
  fee: number;
  netReward: number;
  bankerPoolBefore: number;
  bankerPoolAfter: number;
};
const roundResults = new Map<string, RoundResultRow[]>();
async function readRoundResults(roundId: string): Promise<RoundResultRow[]> {
  if (appMode !== "demo" && persistence.configured) {
    const persisted = await persistence.loadRoundResults(roundId);
    return persisted.map((row) => ({ ...row, hand: row.hand as RoundResultRow["hand"] }));
  }
  return roundResults.get(roundId) ?? [];
}
const riskFlags: Array<{ id: string; userId?: string; roundId?: string; status: "OPEN" | "REVIEW" | "HELD" | "CLOSED"; reason: string; createdAt: string }> = [
  { id: "RF-019", userId: "demo-player-03", status: "REVIEW", reason: "Repeated referral pairing", createdAt: now() },
  { id: "RF-018", roundId: "R-0247", status: "HELD", reason: "Fast round completion", createdAt: now() }
];
const adjustments = new Map<string, { id: string; amount: number; reason: string; ticketId: string; createdBy: string; approvedBy?: string; status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" }>();
// Test/demo runs may use the documented local seed, but production must never
// silently fall back to a predictable seed. The readiness gate and worker both
// require PROJECT12_SERVER_SEED before a real round can run.
const serverSeed = process.env.PROJECT12_SERVER_SEED ?? (appMode === "demo" ? "project12-demo-seed-247" : "");
const packetProvider = createPacketProvider(persistence);
const demoAutoRoundEnabled = appMode === "demo" && !persistence.configured && process.env.DEMO_AUTO_ROUND !== "false";
const demoAutomationDueAt = new Map<string, number>();
const demoAutomationLocks = new Map<string, Promise<void>>();

function demoPhaseDuration(stateName: RoundState): number {
  const defaults: Partial<Record<RoundState, number>> = {
    BANKER_BIDDING: 30_000,
    BETTING: 50_000,
    WAITING_BANKER_CONFIRM: 8_000,
    CLAIMING: 15_000,
    EVALUATING: 1_000,
    SETTLING: 1_000,
    ROUND_COMPLETE: 8_000
  };
  const envName: Partial<Record<RoundState, string>> = {
    BANKER_BIDDING: "DEMO_BANKER_BIDDING_MS",
    BETTING: "DEMO_BETTING_MS",
    WAITING_BANKER_CONFIRM: "DEMO_BANKER_CONFIRM_MS",
    CLAIMING: "DEMO_CLAIM_MS",
    EVALUATING: "DEMO_EVALUATING_MS",
    SETTLING: "DEMO_SETTLING_MS",
    ROUND_COMPLETE: "DEMO_COMPLETE_MS"
  };
  const override = Number(envName[stateName] ? process.env[envName[stateName]!] : undefined);
  return Number.isFinite(override) && override > 0 ? override : defaults[stateName] ?? 1_000;
}

function formatDemoCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

const baseState: DemoState = {
  user: { id: "demo-player-01", displayName: "Alex Tan", role: "PLAYER", available: baseBalances.USER_AVAILABLE, locked: baseBalances.USER_LOCKED, riskStatus: "CLEAR" },
  round: { id: "R-0247", state: "BANKER_BIDDING", ruleVersion: demoRules.id, endsAt: "00:30", players: 8, banker: "未确定", seedHash: hashSeed(serverSeed).slice(0, 16) + "…", bankPool: baseBalances.BANKER_POOL },
  missions: [{ id: "rounds", title: "Complete rounds", progress: 2, target: 3, reward: 120 }, { id: "login", title: "Return for 3 days", progress: 1, target: 3, reward: 80 }, { id: "hand", title: "Collect a special hand", progress: 0, target: 1, reward: 160 }],
  referrals: { code: "P12-ALEX", direct: 4, qualified: 2, pendingReward: 180 },
  leaderboard: [{ userId: "demo-player-01", displayName: "Alex Tan", points: 1280, rank: 1 }, { userId: "demo-banker-01", displayName: "Mira", points: 1140, rank: 2 }, { userId: "demo-player-02", displayName: "Jordan", points: 980, rank: 3 }],
  ledger: [{ id: "J-1004", reason: "Round entry locked", change: -250, balanceAfter: 12500, createdAt: "Today, 14:32" }]
};

type ApiRuntime = { balances: Record<LedgerAccount, number>; state: DemoState };
const productionState: DemoState = {
  user: { id: "", displayName: "Telegram player", role: "PLAYER", available: 0, locked: 0, riskStatus: "CLEAR" },
  round: { id: "", state: "LOBBY", ruleVersion: "12-niuniu-v1", endsAt: "--", players: 0, banker: "—", seedHash: "—", bankPool: 0 },
  missions: [],
  referrals: { code: "", direct: 0, qualified: 0, pendingReward: 0 },
  leaderboard: [],
  ledger: []
};
const productionBalances: Record<LedgerAccount, number> = { USER_AVAILABLE: 0, USER_LOCKED: 0, USER_LOCKED_BANKER_POOL: 0, BANKER_POOL: 0, PLATFORM_FEE: 0, DEMO_GRANTS: 0, CAMPAIGN_REWARD_RESERVE: 0, PENDING_ADJUSTMENT: 0 };
const fallbackRuntime: ApiRuntime = { balances: appMode === "production" ? productionBalances : baseBalances, state: appMode === "production" ? productionState : baseState };
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

const demoAnnouncements = [
  { id: "announcement-1", title: "Internal packet mode", body: "Only players who placed a bet receive the packet claim entry.", status: "PUBLISHED", createdAt: "2026-08-21T00:00:00.000Z" },
  { id: "announcement-2", title: "Fair round records", body: "Round events, packet claims and internal points ledger entries are recorded by the server.", status: "PUBLISHED", createdAt: "2026-08-20T00:00:00.000Z" }
];
function roomSummary() { return { id: "room-12", name: "Project 12 Social Table", players: state.round.players, state: state.round.state, roundId: state.round.id, banker: state.round.banker, bankPool: state.round.bankPool, endsAt: state.round.endsAt }; }
function hallSnapshot() { return { room: roomSummary(), announcements: demoAnnouncements, games: [{ id: "12-niuniu", roomId: "room-12", name: "12牛牛", status: "OPEN", mode: "INTERNAL_PACKET" }] }; }
function roomLeaderboard(category: "points" | "cards" | "banker") {
  const activeBids = bankerBids.get(state.round.id) ?? [];
  const bidCounts = new Map(activeBids.map((bid) => [bid.userId, bid.amount]));
  const rows = (state.leaderboard ?? []).map((entry, index) => {
    const value = category === "points" ? entry.points : category === "cards" ? Math.max(0, entry.points % 100 - index * 3) : (bidCounts.get(entry.userId) ?? 0);
    return { rank: index + 1, userId: entry.userId, displayName: entry.displayName, value, unit: category === "points" ? "PT" : category === "cards" ? "SCORE" : "BIDS", source: category === "banker" && bidCounts.has(entry.userId) ? "CURRENT_ROUND" : "ACCOUNT_HISTORY" };
  }).sort((left, right) => right.value - left.value || left.rank - right.rank).map((entry, index) => ({ ...entry, rank: index + 1 }));
  return { roomId: "room-12", category, entries: rows, empty: rows.length === 0 };
}
function dailyRewardSnapshot() {
  const missions = state.missions;
  const rewards = [
    { id: "banker-18", category: "BANKER", target: 18, progress: 0, reward: 188 },
    { id: "banker-28", category: "BANKER", target: 28, progress: 0, reward: 288 },
    { id: "special-hand", category: "SPECIAL", target: 1, progress: missions.find((mission) => mission.id === "hand")?.progress ?? 0, reward: 388 }
  ].map((reward) => ({ ...reward, claimed: dailyRewardClaims.has(reward.id), available: reward.progress >= reward.target && !dailyRewardClaims.has(reward.id) }));
  return { roomId: "room-12", date: new Date().toISOString().slice(0, 10), claims: [...dailyRewardClaims], rewards };
}

function corsOrigin(request: IncomingMessage): string {
  const configured = process.env.CORS_ORIGIN?.trim();
  if (configured) return configured;
  const origin = header(request, "origin");
  return origin === "http://localhost:4173" || origin === "http://127.0.0.1:4173" || origin === "http://localhost:5173" || origin === "http://127.0.0.1:5173" ? origin : "http://localhost:4173";
}

function json(response: ServerResponse, status: number, body: unknown) {
  const allowedHeaders = ["content-type", "idempotency-key", "x-session-token", ...(appMode === "demo" ? ["x-demo-user", "x-demo-admin-token"] : [])].join(", ");
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate", "access-control-allow-origin": responseCorsOrigins.get(response) ?? process.env.CORS_ORIGIN ?? "http://localhost:4173", "access-control-allow-credentials": "true", "access-control-allow-headers": allowedHeaders, "access-control-allow-methods": "GET, POST, OPTIONS" });
  response.end(status === 204 ? undefined : JSON.stringify(appMode === "production" ? publicResponse(body) : body));
}

function publicResponse(value: unknown): unknown {
  if (typeof value === "string") return value.replaceAll("DEMO CREDIT", "INTERNAL POINTS").replaceAll("Demo Credit", "Internal points").replaceAll("Demo ledger", "Internal ledger").replaceAll("Demo balance", "Account balance").replace(/demo/gi, "internal");
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(publicResponse);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !/^demo/i.test(key)).map(([key, entry]) => [key, publicResponse(entry)]));
  return value;
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
function allowRateLimit(request: IncomingMessage): boolean { const key = (appMode === "demo" ? header(request, "x-demo-user") : undefined) ?? cookie(request, "p12_session") ?? header(request, "x-session-token") ?? "anonymous"; const now = Date.now(); const current = rateLimits.get(key); if (!current || current.resetAt <= now) { rateLimits.set(key, { count: 1, resetAt: now + 60_000 }); return true; } if (current.count >= 60) return false; current.count += 1; return true; }
function cookie(request: IncomingMessage, name: string): string | undefined { return (header(request, "cookie") ?? "").split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.[1]; }
function createDemoSessionToken(userId: string, expiresAt: number): string { const payload = Buffer.from(JSON.stringify({ userId, role: "PLAYER", expiresAt }), "utf8").toString("base64url"); const signature = createHmac("sha256", process.env.SESSION_SECRET ?? "project12-demo-session-fallback").update(payload).digest("base64url"); return `${payload}.${signature}`; }
function verifyDemoSessionToken(token: string): { userId: string; role: "PLAYER" | "ADMIN"; expiresAt: number } | undefined { const [payload, signature] = token.split("."); if (!payload || !signature) return undefined; const expected = createHmac("sha256", process.env.SESSION_SECRET ?? "project12-demo-session-fallback").update(payload).digest("base64url"); if (!safeEqualText(expected, signature)) return undefined; try { const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string; role?: "PLAYER" | "ADMIN"; expiresAt?: number }; const expiresAt = parsed.expiresAt; if (!parsed.userId || parsed.role !== "PLAYER" || typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined; return { userId: parsed.userId, role: parsed.role, expiresAt }; } catch { return undefined; } }
function createSupabaseRealtimeToken(userId: string): { token: string; expiresAt: string } | undefined {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!secret || !/^[0-9a-f-]{36}$/i.test(userId)) return undefined;
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 300;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const jwtHeader = encode({ alg: "HS256", typ: "JWT" });
  const jwtPayload = encode({ aud: "authenticated", exp: expiresAt, iat: issuedAt, iss: "supabase", role: "authenticated", sub: userId });
  const signature = createHmac("sha256", secret).update(`${jwtHeader}.${jwtPayload}`).digest("base64url");
  return { token: `${jwtHeader}.${jwtPayload}.${signature}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
}
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
function normalizeAppLocale(value: unknown): AppLocale { return typeof value === "string" && supportedLocales.has(value as AppLocale) ? value as AppLocale : "zh-CN"; }
function syncUserBalances() { state.user.available = balances.USER_AVAILABLE; state.user.locked = balances.USER_LOCKED; }
function persistAsync(work: () => Promise<void>): void { void work().catch((error: unknown) => console.error(`database persistence failed: ${error instanceof Error ? error.message : String(error)}`)); }
function audit(actor: string, action: string, referenceType: string, referenceId: string, before?: unknown, after?: unknown) { auditLogs.unshift({ id: `AL-${String(auditLogs.length + 1).padStart(4, "0")}`, actor, action, referenceType, referenceId, before, after, createdAt: now() }); persistAsync(() => persistence.persistAudit({ actor, action, referenceType, referenceId, before, after })); }
function queueOutbox(type: string, payload: Record<string, unknown>) { const event = { id: `OB-${String(outboxEvents.length + 1).padStart(4, "0")}`, type, payload, createdAt: now() }; outboxEvents.unshift(event); persistAsync(() => persistence.persistOutbox(type, payload)); return event; }
function writeRoundEvent(response: ServerResponse, event: typeof roundEvents[number]) { if (response.writableEnded || response.destroyed) return false; try { response.write(`event: round\ndata: ${JSON.stringify(event)}\n\n`); return true; } catch { return false; } }
function broadcastRoundEvent(event: typeof roundEvents[number]) { for (const response of realtimeClients) if (!writeRoundEvent(response, event)) realtimeClients.delete(response); }
function canViewRoomMessage(message: RoomMessage, userId: string): boolean {
  if (message.visibility === "PUBLIC_ROOM" || !message.visibility) return true;
  if (message.visibility === "TARGET_USER") return message.targetUserId === userId;
  if (message.visibility === "PARTICIPANTS_ONLY") return (roundBettors.get(state.round.id)?.has(userId) ?? false) || state.round.banker === userId;
  return false;
}
function writeRoomEvent(response: ServerResponse, event: RoomMessage) { if (response.writableEnded || response.destroyed) return false; try { response.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`); return true; } catch { return false; } }
function broadcastRoomEvent(event: RoomMessage) { for (const [response, userId] of roomRealtimeClients) { if (canViewRoomMessage(event, userId) && !writeRoomEvent(response, event)) roomRealtimeClients.delete(response); } }
function hasSupabaseRealtime(): boolean { return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)); }
function publishSupabaseRoomBroadcast(event: RoomMessage): void {
  if (event.visibility !== "PUBLIC_ROOM") return;
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) return;
  void fetch(`${supabaseUrl}/realtime/v1/api/broadcast?private=true`, { method: "POST", headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" }, body: JSON.stringify({ messages: [{ topic: "room-12", event: "message", payload: { message: event } }] }) }).catch((error: unknown) => console.error(`supabase realtime broadcast failed: ${error instanceof Error ? error.message : String(error)}`));
}
function stateDeadline(to: RoundState): Date | null { const seconds: Partial<Record<RoundState, number>> = { BANKER_BIDDING: 30, BETTING: 50, WAITING_BANKER_CONFIRM: 60, CLAIMING: 15, EVALUATING: 10, SETTLING: 15 }; return seconds[to] === undefined ? null : new Date(Date.now() + seconds[to]! * 1000); }
async function transition(to: RoundState, actor: string, payload: Record<string, unknown> = {}) {
  const from = state.round.state;
  assertTransition(from, to);
  const stateEndsAt = stateDeadline(to);
  await persistence.persistRoundEvent({ roundId: state.round.id, from, to, stateEndsAt, payload: { ...payload, stateEndsAt: stateEndsAt?.toISOString() ?? null }, actor });
  state.round.state = to;
  if (demoAutoRoundEnabled && demoPhaseDuration(to) > 0) {
    scheduleDemoPhase(state.round.id, to);
    state.round.endsAt = formatDemoCountdown(demoPhaseDuration(to));
  }
  const event = { id: `RE-${String(roundEvents.length + 1).padStart(4, "0")}`, roundId: state.round.id, from, to, payload, createdAt: now() };
  roundEvents.unshift(event);
  queueOutbox("ROUND_STATE_CHANGED", { ...event });
  audit(actor, "ROUND_STATE_CHANGED", "ROUND", state.round.id, { state: from }, { state: to, ...payload });
  if (to === "BETTING" && typeof payload.amount === "number") await addRoomMessage("BANKER", `${messageActor(String(payload.banker ?? actor))} 抢庄 ${Math.max(payload.amount, Number(payload.currentHighest ?? 0))} PT，当前进入下注阶段。`, { templateKey: "game.banker.confirmed", stageKey: "BETTING_STARTED", stageAsset: "/game/start-betting.jpg", banker: payload.banker ?? actor, amount: payload.amount, currentHighest: payload.currentHighest });
  if (to === "WAITING_BANKER_CONFIRM" && payload.bettingClosed === true) await addRoomMessage("ROUND", `✅ 下注已结束，已记录本局 ${Number(payload.bettorCount ?? 0)} 位下注玩家。请庄家在聊天室发送任意文字确认发包；发送 /重推取消本局。旁观者不会收到领取入口。`, { templateKey: "game.packet.pending", stageKey: "BETTING_STOPPED", stageAsset: "/game/stop-betting.jpg", bettorCount: payload.bettorCount, banker: payload.banker, packetMode: "INTERNAL" });
  if (to === "PACKET_SENT" && payload.bettingClosed === true) await addRoomMessage("ROUND", `🎁 庄家已确认，平台红包已向本局 ${Number(payload.bettorCount ?? 0)} 位已下注玩家私发。旁观者不会收到领取入口。`, { templateKey: "game.packet.sent", stageKey: "PACKET_SENT", stageAsset: "/game/start-packet.jpg", amount: payload.amount, packetId: payload.packetId, bettorCount: payload.bettorCount, packetMode: "INTERNAL" });
  if (to === "EVALUATING" && typeof payload.claimedAt === "string") {
    await addRoomMessage("PACKET", `${messageActor(actor)} 已领取平台红包，抢包结束，进入算牌。`, { templateKey: "game.packet.claimedBy", stageKey: "CLAIMS_ENDED", stageAsset: "/game/stop-packet.jpg", claimSequence: payload.claimSequence, player: messageActor(actor) }, actor);
    await addRoomMessage("ROUND", "⏳ 红包领取结束，系统正在计算牌型、比较庄家并生成成绩榜。", { templateKey: "game.results.calculating", calculation: true, roundId: state.round.id }, undefined, "PUBLIC_ROOM");
  }
  if (to === "ROUND_COMPLETE") await addRoomMessage("SETTLEMENT", `平台通知：回合已完成，结算结果已写入内部积分账本。`, { templateKey: "game.settlement.complete", outcome: payload.outcome });
  broadcastRoundEvent(event);
  return event;
}
async function writeIdempotent(request: IncomingMessage, response: ServerResponse, work: (key: string) => unknown | Promise<unknown>) { const key = header(request, "idempotency-key"); if (!key) return json(response, 400, { error: "Idempotency-Key is required for writes" }); const persisted = await persistence.getIdempotency(key); if (persisted !== undefined) return json(response, 200, { replayed: true, result: persisted }); if (idempotency.has(key)) return json(response, 200, { replayed: true, result: idempotency.get(key) }); const result = await work(key); idempotency.set(key, result); await persistence.putIdempotency(key, session(request)?.userId ?? "anonymous", result); return json(response, 200, { replayed: false, result }); }
function createSettlementJournal(idempotencyKey: string, result: ReturnType<typeof settlePlayer>, journalId = "J-1005"): Journal {
  const stake = result.stake;
  const grossReward = result.grossReward;
  const fee = result.fee;
  const lines = result.outcome === "WIN"
    ? [{ account: "USER_LOCKED" as const, direction: "DEBIT" as const, amount: stake }, { account: "BANKER_POOL" as const, direction: "DEBIT" as const, amount: grossReward }, { account: "USER_AVAILABLE" as const, direction: "CREDIT" as const, amount: stake + grossReward - fee }, { account: "PLATFORM_FEE" as const, direction: "CREDIT" as const, amount: fee }]
    : result.outcome === "LOSE"
      ? [{ account: "USER_LOCKED" as const, direction: "DEBIT" as const, amount: stake }, { account: "BANKER_POOL" as const, direction: "CREDIT" as const, amount: stake - fee }, { account: "PLATFORM_FEE" as const, direction: "CREDIT" as const, amount: fee }]
      : [{ account: "USER_LOCKED" as const, direction: "DEBIT" as const, amount: stake }, { account: "USER_AVAILABLE" as const, direction: "CREDIT" as const, amount: stake }];
  const journal: Journal = { id: journalId, referenceType: "ROUND_SETTLEMENT", referenceId: state.round.id, idempotencyKey, reason: `Round settlement · ${result.outcome} · internal points`, lines: lines.filter((line) => line.amount > 0) };
  assertBalanced(journal); return journal;
}
function createRefundJournal(idempotencyKey: string, amount: number): Journal { const journal = createTransferJournal({ id: "J-1006", referenceType: "ROUND_REFUND", referenceId: state.round.id, idempotencyKey, reason: "Cancelled round refund", from: "USER_LOCKED", to: "USER_AVAILABLE", amount }); assertBalanced(journal); return journal; }
function rejectMoney(response: ServerResponse) { return json(response, 403, { code: realMoneyDisabled ? "REAL_MONEY_DISABLED" : "PROVIDER_APPROVAL_REQUIRED", message: "Real-money operations are unavailable; this app uses internal points." }); }
function requirePlayer(request: IncomingMessage, response: ServerResponse): { userId: string; role: "PLAYER" | "ADMIN" } | undefined { const identity = session(request); if (!identity) { json(response, 401, { error: "Unauthorized" }); return undefined; } return identity; }
async function verificationState(userId: string): Promise<VerificationSnapshot> {
  const cached = verificationStates.get(userId);
  if (cached) return cached;
  const persisted = await persistence.loadVerification(userId);
  if (persisted) { verificationStates.set(userId, persisted); return persisted; }
  if (appMode === "demo" && !persistence.configured && userId === demoVerifiedUserId) {
    const approved: VerificationSnapshot = { status: "APPROVED", submittedAt: "2026-08-21T00:00:00.000Z", tngAccountLast4: "••••3123" };
    verificationStates.set(userId, approved);
    return approved;
  }
  const initial: VerificationSnapshot = { status: "NOT_SUBMITTED" };
  verificationStates.set(userId, initial);
  return initial;
}
async function requireVerifiedPlayer(request: IncomingMessage, response: ServerResponse): Promise<{ userId: string; role: "PLAYER" | "ADMIN" } | undefined> {
  const identity = requirePlayer(request, response);
  if (!identity) return undefined;
  const verification = await verificationState(identity.userId);
  if (verification.status !== "APPROVED") { json(response, 403, { code: "VERIFICATION_REQUIRED", status: verification.status, message: "实名认证通过后才能使用聊天和钱包" }); return undefined; }
  return identity;
}
function verificationInput(data: Record<string, unknown>): { legalName: string; tngAccountNo: string } {
  const legalName = typeof data.legalName === "string" ? data.legalName.trim() : "";
  const tngAccountNo = typeof data.tngAccountNo === "string" ? data.tngAccountNo.replace(/[\s-]/g, "") : "";
  if (legalName.length < 2 || legalName.length > 80) throw new Error("请输入有效的真实姓名");
  if (!/^\d{8,20}$/.test(tngAccountNo)) throw new Error("请输入有效的 TNG eWallet 账号");
  return { legalName, tngAccountNo };
}
function messageActor(userId: string): string {
  if (userId === state.user.id) return "你";
  if (userId === "demo-banker-01") return "庄家";
  return `玩家-${userId.slice(-4)}`;
}
async function chatAttachmentInput(data: Record<string, unknown>): Promise<{ name: string; mime: string; size: number; dataUrl?: string; url?: string } | undefined> {
  const raw = data.attachment;
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "聊天图片";
  const dataUrl = typeof input.dataUrl === "string" ? input.dataUrl : "";
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("图片格式无效，只支持 JPG、PNG 或 WebP");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) throw new Error("图片不能超过 10MB");
  const mime = match[1];
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "chat-attachments";
  if (supabaseUrl && serviceKey) {
    const extension = mime === "image/jpeg" ? "jpg" : mime.slice("image/".length);
    const objectPath = `room-12/${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
    const upload = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, { method: "POST", headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "content-type": mime, "x-upsert": "false" }, body: bytes });
    if (!upload.ok) throw new Error("图片上传失败，请稍后重试");
    return { name, mime, size: bytes.length, url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}` };
  }
  if (appMode !== "demo") throw new Error("图片存储尚未配置，请联系管理员");
  return { name, mime, size: bytes.length, dataUrl };
}
async function addRoomMessage(type: string, message: string, payload: Record<string, unknown> = {}, userId?: string, visibility: "PUBLIC_ROOM" | "PARTICIPANTS_ONLY" | "TARGET_USER" | "ADMIN_ONLY" = "PUBLIC_ROOM", targetUserId?: string, roundId = state.round.id): Promise<void> {
  const templateKey = typeof payload.templateKey === "string" ? payload.templateKey : undefined;
  const createdAt = now();
  const persisted = await persistence.persistRoomMessage({ roundId, type, body: message, payload, templateKey, userId, visibility, targetUserId });
  const messageSeq = persisted?.messageSeq ?? ++nextDemoMessageSeq;
  const entry: RoomMessage = { id: persisted?.id ?? `MSG-${String(roomMessages.length + 1).padStart(4, "0")}`, messageSeq, type, body: message, createdAt: persisted?.createdAt ?? createdAt, payload, ...(templateKey ? { templateKey } : {}), visibility, ...(userId ? { actor: messageActor(userId) } : {}), ...(targetUserId ? { targetUserId } : {}) };
  nextDemoMessageSeq = Math.max(nextDemoMessageSeq, messageSeq);
  roomMessages.push(entry);
  broadcastRoomEvent(entry);
  publishSupabaseRoomBroadcast(entry);
  queueOutbox("INTERNAL_CHAT_MESSAGE", { messageId: entry.id, roundId, type, body: message, payload, visibility, targetUserId });
}
async function executeBid(identity: { userId: string }, key: string, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Bid must be a positive integer");
  if (state.round.state !== "BANKER_BIDDING") throw new Error("Banker bidding is closed");
  await persistence.persistBankerBid(identity.userId, amount, state.round.id);
  if (persistence.configured) await hydrateUserRuntime(identity.userId);
  const bids = bankerBids.get(state.round.id) ?? [];
  const bid = { userId: identity.userId, amount, serverReceivedAt: now() };
  bankerBids.set(state.round.id, [...bids.filter((item) => item.userId !== identity.userId), bid]);
  const winner = chooseBanker(bankerBids.get(state.round.id) ?? []);
  if (!winner) throw new Error("Unable to select banker");
  const currentHighest = winner.amount;
  const banker = winner.userId;
  state.round.banker = banker;
  if (banker === state.user.id) state.user.role = "BANKER";
  audit(identity.userId, "BANKER_BID_RECORDED", "ROUND", state.round.id, undefined, { amount, currentHighest, banker, idempotencyKey: key, bidAcceptedAt: bid.serverReceivedAt });
  return { state: state.round.state, banker, amount, currentHighest, bidAccepted: true, biddingClosed: false, message: `${amount} PT 抢庄已记录，当前最高庄金为 ${currentHighest} PT。发送「结束抢庄」后进入下注阶段。` };
}
async function executeCloseBankerBidding(identity: { userId: string }, key: string) {
  if (state.round.state !== "BANKER_BIDDING") throw new Error("抢庄阶段已经结束");
  const persistedBids = persistence.configured ? await persistence.listBankerBids(state.round.id) : [];
  const bids = persistedBids.length > 0 ? persistedBids : bankerBids.get(state.round.id) ?? [];
  const winner = chooseBanker(bids);
  if (!winner) throw new Error("至少需要一位玩家抢庄才能开始下注");
  if (winner.userId !== identity.userId) throw new Error("只有当前最高庄金玩家可以结束抢庄");
  state.round.banker = winner.userId;
  if (winner.userId === state.user.id) state.user.role = "BANKER";
  await persistence.persistRoundBanker(winner.userId, state.round.id);
  if (persistence.configured) await hydrateUserRuntime(identity.userId);
  await transition("BETTING", identity.userId, { amount: winner.amount, currentHighest: winner.amount, banker: winner.userId, idempotencyKey: key, biddingClosed: true, bidAcceptedAt: winner.serverReceivedAt });
  audit(identity.userId, "BANKER_BIDDING_CLOSED", "ROUND", state.round.id, undefined, { banker: winner.userId, amount: winner.amount, bidCount: bids.length, idempotencyKey: key });
  return { state: state.round.state, banker: winner.userId, amount: winner.amount, currentHighest: winner.amount, biddingClosed: true, bidCount: bids.length };
}
function parseChatBetCommand(text: string): { amount: number; mode: "BET" | "SHOVE" } | undefined {
  const normal = /^(?:(?:下注|bet)\s*)?(\d+)$/i.exec(text);
  if (normal) {
    const amount = Number(normal[1]);
    if (amount < 2 || amount > 17) throw new Error("普通下注只能发送 2–17 的整数");
    return { amount, mode: "BET" };
  }
  const shove = /^(?:(?:sh|shove)\s*|梭哈\s*)(\d+)$/i.exec(text);
  if (shove) {
    const amount = Number(shove[1]);
    if (amount < 10 || amount > 177) throw new Error("梭哈下注只能发送 sh10–sh177 的整数");
    return { amount, mode: "SHOVE" };
  }
  return undefined;
}
async function executeBet(identity: { userId: string }, key: string, amount: number, source: "CHAT" | "LEGACY" = "LEGACY") {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Bet amount must be a positive integer");
  if (state.round.state !== "BETTING") throw new Error("Betting is closed");
  if (state.round.banker === identity.userId) throw new Error("Bankers cannot place player bets");
  const existingBettors = await roundBettorRows();
  if (existingBettors.some((bettor) => bettor.userId === identity.userId)) throw new Error("每位玩家每局只能下注一次");
  const journal = createTransferJournal({ id: `J-BET-${identity.userId}`, referenceType: "BET_LOCK", referenceId: state.round.id, idempotencyKey: key, reason: "Lock internal points bet", from: "USER_AVAILABLE", to: "USER_LOCKED", amount });
  Object.assign(balances, applyJournal(balances, journal));
  await persistence.persistBet(identity.userId, amount, state.round.id);
  await persistence.persistJournal(journal, identity.userId);
  const bettors = roundBettors.get(state.round.id) ?? new Map<string, number>();
  bettors.set(identity.userId, amount);
  roundBettors.set(state.round.id, bettors);
  syncUserBalances();
  if (source === "LEGACY") await addRoomMessage("BET", `${messageActor(identity.userId)} 下单 ${amount} PT，等待停止下注。`, { amount, packetMode: "PENDING" }, identity.userId);
  state.ledger.unshift({ id: journal.id, reason: journal.reason, change: -amount, balanceAfter: state.user.available, createdAt: "Just now" });
  audit(identity.userId, "BET_LOCKED", "JOURNAL", journal.id, undefined, { journal, bettingClosed: false });
  return { state: state.round.state, locked: state.user.locked, journal, bettingClosed: false, packet: null };
}
async function roundBettorRows(): Promise<Array<{ userId: string; amount: number }>> {
  const persistedBettors = persistence.configured ? await persistence.listRoundBettors(state.round.id) : [];
  return persistedBettors.length > 0 ? persistedBettors : [...(roundBettors.get(state.round.id) ?? new Map<string, number>())].map(([userId, amount]) => ({ userId, amount }));
}
async function executeCloseBetting(identity: { userId: string }, key: string) {
  if (state.round.state !== "BETTING") throw new Error("下注阶段已经结束");
  if (state.round.banker !== identity.userId) throw new Error("只有当前庄家可以停止下注");
  const bettorRows = await roundBettorRows();
  if (bettorRows.length === 0) throw new Error("至少需要一位下注玩家才能发放红包");
  await transition("WAITING_BANKER_CONFIRM", identity.userId, { bettorCount: bettorRows.length, banker: identity.userId, bettingClosed: true, idempotencyKey: key, acceptedAt: now(), packetMode: "INTERNAL" });
  audit(identity.userId, "BETTING_CLOSED", "ROUND", state.round.id, undefined, { bettorCount: bettorRows.length, waitingFor: "BANKER_CONFIRMATION" });
  return { state: state.round.state, packet: null, bettorCount: bettorRows.length, bettingClosed: true, waitingFor: "BANKER_CONFIRMATION" };
}
async function executeConfirmPacket(identity: { userId: string }, key: string) {
  if (state.round.state !== "WAITING_BANKER_CONFIRM") throw new Error("当前不在等待庄家确认阶段");
  if (state.round.banker !== identity.userId) throw new Error("只有当前庄家可以确认发红包");
  const bettorRows = await roundBettorRows();
  if (bettorRows.length === 0) throw new Error("至少需要一位下注玩家才能发放红包");
  const totalBets = bettorRows.reduce((sum, row) => sum + row.amount, 0);
  const totalAmount = Math.max(bettorRows.length, totalBets || balances.USER_LOCKED || 1);
  const packet = await packetProvider.createPacket({ roundId: state.round.id, amount: totalAmount, maxClaims: bettorRows.length, serverSeedHash: hashSeed(serverSeed) });
  packetIds.set(state.round.id, packet.id);
  await persistence.persistPacket(packet.provider, hashSeed(serverSeed), undefined, state.round.id);
  await persistence.persistPacketAllocations(packet.id, bettorRows);
  const totalShove = bettorRows.filter((row) => row.amount >= 10).reduce((sum, row) => sum + row.amount, 0);
  const successfulBets = bettorRows.map((row) => `${messageActor(row.userId)} ${row.amount}`).join("\n");
  const persistedBids = persistence.configured ? await persistence.listBankerBids(state.round.id) : [];
  const bankerAmount = (persistedBids.length > 0 ? persistedBids : bankerBids.get(state.round.id) ?? []).find((bid) => bid.userId === identity.userId)?.amount ?? 0;
  await addRoomMessage("BANKER", `庄家：${messageActor(identity.userId)}\n庄钱：${bankerAmount}\n发包金额：${packet.totalAmount}\n发包数量：${packet.maxClaims}\n总下注额：${totalBets}\n总梭哈额：${totalShove}\n\n本局下注成功名单（${bettorRows.length}）：\n${successfulBets || "暂无"}`, { templateKey: "game.betting.summary", summary: true, banker: identity.userId, bankerAmount, packetAmount: packet.totalAmount, packetCount: packet.maxClaims, totalBets, totalShove, successfulBets: bettorRows.map((row) => ({ userId: row.userId, amount: row.amount })) }, undefined, "PUBLIC_ROOM");
  await transition("PACKET_SENT", identity.userId, { amount: packet.totalAmount, packetId: packet.id, maxClaims: packet.maxClaims, bettorCount: bettorRows.length, bettingClosed: true, acceptedAt: now(), packetMode: "INTERNAL", idempotencyKey: key });
  await transition("CLAIMING", identity.userId, { packetId: packet.id, maxClaims: packet.maxClaims });
  for (const bettor of bettorRows) {
    await addRoomMessage("PACKET_CARD", "平台内部红包已发放给本局参与者。", { packetId: packet.id, roundId: state.round.id, amount: packet.totalAmount, maxClaims: packet.maxClaims }, undefined, "TARGET_USER", bettor.userId);
    queueOutbox("ROUND_PACKET_AVAILABLE", { notificationId: `packet:${state.round.id}:${packet.id}:${bettor.userId}`, roundId: state.round.id, packetId: packet.id, amount: packet.totalAmount, maxClaims: packet.maxClaims, recipients: [bettor.userId] });
  }
  state.round.endsAt = "00:15";
  audit(identity.userId, "BANKER_PACKET_CONFIRMED", "ROUND", state.round.id, undefined, { packetId: packet.id, bettorCount: bettorRows.length, amount: packet.totalAmount });
  return { state: state.round.state, packet, bettorCount: bettorRows.length, bettingClosed: true };
}
async function publishRoundResults(roundId: string, packetId: string, bettorRows: Array<{ userId: string; amount: number }>, claims: Array<{ userId: string; value: number }>) {
  const bankerRound = demoRoundHand(serverSeed, roundId);
  const bankerHand = { ...bankerRound.hand, amount: Number(bankerRound.amount) };
  let bankerPool = state.round.bankPool;
  const rows = bettorRows.map((bettor) => {
    const claim = claims.find((item) => item.userId === bettor.userId);
    const packetValue = claim?.value ?? 0;
    const hand = classifyPacket(packetValue.toFixed(2)).hand;
    const bankerPoolBefore = bankerPool;
    const settlement = settlePlayer({ stake: bettor.amount, player: hand, banker: bankerHand, bankerPool });
    bankerPool = settlement.bankerPoolAfter;
    return {
      userId: bettor.userId,
      betAmount: bettor.amount,
      packetValue,
      hand,
      outcome: settlement.outcome,
      multiplier: settlement.multiplier,
      grossReward: settlement.grossReward,
      fee: settlement.fee,
      netReward: settlement.netReward,
      bankerPoolBefore,
      bankerPoolAfter: settlement.bankerPoolAfter
    } satisfies RoundResultRow;
  });
  roundResults.set(roundId, rows);
  const summary = rows.map((row) => `${messageActor(row.userId)} · 红包 ${row.packetValue.toFixed(2)} · ${row.hand.type}${row.hand.points} · ${row.outcome} · 下注 ${row.betAmount} PT · ${row.netReward > 0 ? `净赢 ${row.netReward.toFixed(2)}` : "无净赢"}`).join("\n");
  await addRoomMessage("RESULTS", `📊 本局成绩已公布\n庄家：${messageActor(state.round.banker)} · ${bankerHand.type}${bankerHand.points} · 牌面 ${bankerRound.amount}\n${summary}`, { templateKey: "game.results.published", roundId, packetId, bankerHand, bankerAmount: bankerRound.amount, bankerCards: bankerRound.digits, results: rows }, undefined, "PUBLIC_ROOM");
  return rows;
}
async function startNextRound(actor: string) {
  if (persistence.configured && appMode !== "demo") throw new Error("ROUND_CONTINUATION_REQUIRES_WORKER");
  const previousRoundId = state.round.id;
  const nextNumber = Number(previousRoundId.replace(/\D/g, "")) + 1;
  const nextRoundId = `R-${String(nextNumber || Date.now()).padStart(4, "0")}`;
  state.round = { ...state.round, id: nextRoundId, state: "BANKER_BIDDING", banker: "未确定", endsAt: "00:30", seedHash: hashSeed(`${serverSeed}:${nextRoundId}`).slice(0, 16) + "…" };
  state.user.role = "PLAYER";
  bankerBids.delete(previousRoundId);
  roundBettors.delete(previousRoundId);
  packetIds.delete(previousRoundId);
  roundResults.delete(previousRoundId);
  scheduleDemoPhase(nextRoundId, "BANKER_BIDDING");
  await addRoomMessage("ROUND", `🟢 新一局 ${nextRoundId} 已开始，等待玩家抢庄。`, { templateKey: "game.round.started", roundId: nextRoundId, previousRoundId });
  queueOutbox("ROUND_STARTED", { roundId: nextRoundId, previousRoundId, actor });
  audit(actor, "ROUND_CONTINUED", "ROUND", nextRoundId, { previousRoundId }, { state: "BANKER_BIDDING" });
  return { roundId: nextRoundId, state: state.round.state, banker: state.round.banker };
}
async function executePacketClaim(identity: { userId: string }, key: string) {
  if (!realMoneyDisabled) throw new Error("Unexpected money mode");
  if (packetProvider.status !== "READY") throw new Error(`Packet provider unavailable: ${packetProvider.name}`);
  if (!["CLAIMING", "EVALUATING"].includes(state.round.state)) throw new Error("Claim window is closed");
  const bettorRows = await roundBettorRows();
  const bettorIds = bettorRows.map((row) => row.userId);
  if (!bettorIds.includes(identity.userId)) throw new PacketProviderError("ROUND_PARTICIPANT_REQUIRED", "只有本局已下注玩家可以领取平台红包");
  const packetId = packetIds.get(state.round.id) ?? (await packetProvider.getPacket(state.round.id))?.id;
  if (!packetId) throw new Error("平台红包尚未发放");
  packetIds.set(state.round.id, packetId);
  const claim = await packetProvider.claim({ packetId, serverSeed, roundId: state.round.id, userId: identity.userId, claimSequence: 1 });
  await persistence.persistPacketClaim(identity.userId, claim.claimSequence, claim.value, state.round.id);
  const claims = await packetProvider.getClaims(packetId);
  const allClaimed = claims.length >= bettorIds.length;
  let results: RoundResultRow[] | undefined;
  if (allClaimed && state.round.state === "CLAIMING") {
    await transition("EVALUATING", identity.userId, { claimSequence: claim.claimSequence, claimedAt: claim.claimedAt, idempotencyKey: key });
    if (appMode === "demo") results = await publishRoundResults(state.round.id, packetId, bettorRows, claims.map((item) => ({ userId: item.userId, value: item.value })));
  }
  state.round.endsAt = allClaimed ? (appMode === "demo" ? "Done" : "00:10") : "00:15";
  const bankerRound = demoRoundHand(serverSeed, state.round.id);
  const hand = { ...bankerRound.hand, amount: Number(bankerRound.amount) };
  audit(identity.userId, "INTERNAL_PACKET_CLAIMED", "ROUND", state.round.id, undefined, { ...claim, allClaimed, claimedCount: claims.length });
  return { ...claim, hand, results, allClaimed, claimedCount: claims.length, maxClaims: bettorIds.length, state: state.round.state };
}

function scheduleDemoPhase(roundId: string, roundState: RoundState): void {
  if (!demoAutoRoundEnabled || demoPhaseDuration(roundState) <= 0) {
    demoAutomationDueAt.delete(roundId);
    return;
  }
  demoAutomationDueAt.set(roundId, Date.now() + demoPhaseDuration(roundState));
}

function updateDemoCountdown(): void {
  if (!demoAutoRoundEnabled) return;
  const dueAt = demoAutomationDueAt.get(state.round.id);
  if (dueAt !== undefined) state.round.endsAt = formatDemoCountdown(dueAt - Date.now());
}

async function seedDemoBettors(roundId: string): Promise<void> {
  const bettors = roundBettors.get(roundId) ?? new Map<string, number>();
  const bankerId = state.round.banker;
  const seeded = demoSeededBettors(bankerId);
  for (const entry of seeded) {
    if (entry.userId === bankerId || bettors.has(entry.userId)) continue;
    if (entry.userId === state.user.id) {
      await executeBet({ userId: entry.userId }, `auto-bet:${roundId}:${entry.userId}`, entry.amount, "CHAT");
    } else {
      bettors.set(entry.userId, entry.amount);
    }
    await addRoomMessage("USER", entry.text, { command: "BET", amount: entry.amount, mode: entry.mode, automated: true }, entry.userId);
  }
  roundBettors.set(roundId, bettors);
}

function demoSeededBettors(bankerId: string): Array<{ userId: string; amount: number; text: string; mode: "BET" | "SHOVE" }> {
  const seeded: Array<{ userId: string; amount: number; text: string; mode: "BET" | "SHOVE" }> = [
    { userId: "demo-player-01", amount: 8, text: "8", mode: "BET" },
    { userId: "demo-player-02", amount: 40, text: "sh40", mode: "SHOVE" },
    { userId: "demo-player-03", amount: 5, text: "5", mode: "BET" },
    { userId: "demo-player-04", amount: 16, text: "sh16", mode: "SHOVE" }
  ];
  return seeded.filter((entry) => entry.userId !== bankerId);
}

async function ensureDemoBettorsForClaim(roundId: string): Promise<Array<{ userId: string; amount: number }>> {
  const existing = await roundBettorRows();
  if (existing.length > 0) return existing;
  const recovered = demoSeededBettors(state.round.banker).map((entry) => [entry.userId, entry.amount] as const);
  roundBettors.set(roundId, new Map(recovered));
  return recovered.map(([userId, amount]) => ({ userId, amount }));
}

async function finalizeDemoRound(actor: string, rows: RoundResultRow[]): Promise<void> {
  if (state.round.state !== "EVALUATING") return;
  const userResult = rows.find((row) => row.userId === state.user.id);
  let settlement: ReturnType<typeof settlePlayer> | undefined;
  let journal: Journal | undefined;
  if (userResult && balances.USER_LOCKED > 0) {
    const bankerRound = demoRoundHand(serverSeed, state.round.id);
    const bankerHand = { ...bankerRound.hand, amount: Number(bankerRound.amount) };
    settlement = settlePlayer({ stake: balances.USER_LOCKED, player: userResult.hand, banker: bankerHand, bankerPool: userResult.bankerPoolBefore });
    journal = createSettlementJournal(`auto-settlement:${state.round.id}`, settlement, `J-AUTO-${state.round.id}`);
  }
  await transition("SETTLING", actor, { automated: true, journalId: journal?.id, outcome: settlement?.outcome ?? "DEMO_ONLY" });
  if (journal && settlement) {
    Object.assign(balances, applyJournal(balances, journal));
    await persistence.persistHand(state.user.id, userResult?.hand.points ?? 0, userResult?.hand.type ?? "普通点数", classifyPacket(userResult?.packetValue ?? 0).digits.slice(-3), state.round.id);
    await persistence.persistSettlement(state.user.id, settlement.outcome, state.round.id);
    await persistence.persistJournal(journal, state.user.id);
    syncUserBalances();
    state.round.bankPool = balances.BANKER_POOL;
    state.ledger.unshift({ id: journal.id, reason: journal.reason, change: journal.lines.filter((line) => line.account === "USER_AVAILABLE" && line.direction === "CREDIT").reduce((sum, line) => sum + line.amount, 0), balanceAfter: state.user.available, createdAt: "Just now" });
    const mission = state.missions.find((item) => item.id === "rounds");
    if (mission) mission.progress = Math.min(mission.target, mission.progress + 1);
    const player = state.leaderboard?.find((item) => item.userId === state.user.id);
    if (player) player.points += Math.round(settlement.netReward);
  }
  await transition("ROUND_COMPLETE", actor, { automated: true, journalId: journal?.id, outcome: settlement?.outcome ?? "DEMO_ONLY" });
  audit(actor, "DEMO_ROUND_AUTO_FINALIZED", "ROUND", state.round.id, undefined, { resultCount: rows.length, journalId: journal?.id });
}

async function runDemoRoundStep(): Promise<void> {
  const roundId = state.round.id;
  switch (state.round.state) {
    case "BANKER_BIDDING": {
      const existingBids = bankerBids.get(roundId) ?? [];
      if (!existingBids.some((bid) => bid.userId === "demo-banker-01")) {
        await executeBid({ userId: "demo-banker-01" }, `auto-bid:${roundId}`, 3555);
        await addRoomMessage("USER", "3555", { command: "BID", amount: 3555, automated: true }, "demo-banker-01");
      }
      const winner = chooseBanker(bankerBids.get(roundId) ?? []);
      if (winner) {
        await addRoomMessage("USER", "结束抢庄", { command: "CLOSE_BANKER", automated: true }, winner.userId);
        await executeCloseBankerBidding({ userId: winner.userId }, `auto-close-banker:${roundId}`);
      }
      return;
    }
    case "BETTING": {
      await seedDemoBettors(roundId);
      const banker = state.round.banker;
      if (!banker || banker === "未确定") return;
      await addRoomMessage("USER", "停止下注", { command: "CLOSE_BETTING", automated: true }, banker);
      await executeCloseBetting({ userId: banker }, `auto-close-betting:${roundId}`);
      return;
    }
    case "WAITING_BANKER_CONFIRM": {
      const banker = state.round.banker;
      if (!banker || banker === "未确定") return;
      await addRoomMessage("USER", "确认发包", { command: "CONFIRM_PACKET", automated: true }, banker);
      await executeConfirmPacket({ userId: banker }, `auto-confirm-packet:${roundId}`);
      return;
    }
    case "CLAIMING": {
      const bettorRows = await ensureDemoBettorsForClaim(roundId);
      let packetId = packetIds.get(roundId) ?? (await packetProvider.getPacket(roundId))?.id;
      if (!packetId && bettorRows.length > 0) {
        const totalBets = bettorRows.reduce((sum, bettor) => sum + bettor.amount, 0);
        const packet = await packetProvider.createPacket({ roundId, amount: Math.max(bettorRows.length, totalBets), maxClaims: bettorRows.length, serverSeedHash: hashSeed(serverSeed) });
        packetId = packet.id;
        packetIds.set(roundId, packet.id);
      }
      if (!packetId) return;
      let results: RoundResultRow[] | undefined;
      for (const bettor of bettorRows) {
        const claims = await packetProvider.getClaims(packetId);
        if (claims.some((claim) => claim.userId === bettor.userId)) continue;
        const claim = await executePacketClaim({ userId: bettor.userId }, `auto-claim:${roundId}:${bettor.userId}`);
        if (claim.results) results = claim.results;
      }
      if ((state.round.state as RoundState) === "EVALUATING") await finalizeDemoRound("demo-system", results ?? roundResults.get(roundId) ?? []);
      return;
    }
    case "EVALUATING":
      await finalizeDemoRound("demo-system", roundResults.get(roundId) ?? []);
      return;
    case "SETTLING":
      await transition("ROUND_COMPLETE", "demo-system", { automated: true, outcome: "DEMO_ONLY" });
      return;
    case "ROUND_COMPLETE":
      await startNextRound("demo-system");
      return;
    default:
      return;
  }
}

async function advanceDemoRoundIfDue(): Promise<boolean> {
  if (!demoAutoRoundEnabled || process.env.NODE_ENV === "test") return false;
  if (!demoAutomationDueAt.has(state.round.id)) scheduleDemoPhase(state.round.id, state.round.state);
  updateDemoCountdown();
  const dueAt = demoAutomationDueAt.get(state.round.id);
  if (dueAt === undefined || dueAt > Date.now()) return false;
  const currentLock = demoAutomationLocks.get(state.round.id);
  if (currentLock) return false;
  const work = runDemoRoundStep().finally(() => demoAutomationLocks.delete(state.round.id));
  demoAutomationLocks.set(state.round.id, work);
  await work;
  return true;
}

export async function advanceDemoRoundNow(): Promise<void> {
  if (!demoAutoRoundEnabled) throw new Error("Demo round automation is disabled");
  await runDemoRoundStep();
}

function onboardingState(userId: string) { const current = onboarding.get(userId) ?? { deviceBound: false, referrerBound: false, pinSet: false }; onboarding.set(userId, current); return current; }
async function hydrateRuntime(runtime: ApiRuntime): Promise<void> {
  if (!persistence.configured) return;
  const snapshot = await persistence.loadRoundRuntime();
  if (snapshot) {
    runtime.state.round.id = snapshot.roundId;
    runtime.state.round.state = snapshot.state;
    runtime.state.round.endsAt = snapshot.stateEndsAt ? formatDemoCountdown(Math.max(0, Date.parse(snapshot.stateEndsAt) - Date.now())) : ["ROUND_COMPLETE", "ROUND_CANCELLED", "REFUNDED"].includes(snapshot.state) ? "完成" : runtime.state.round.endsAt;
    runtime.state.round.banker = snapshot.bankerUserId ?? runtime.state.round.banker;
    runtime.state.round.bankPool = snapshot.bankerPool;
    runtime.balances.BANKER_POOL = snapshot.bankerPool;
  }
  const bettors = await persistence.listRoundBettors(snapshot?.roundId ?? runtime.state.round.id);
  roundBettors.set(snapshot?.roundId ?? runtime.state.round.id, new Map(bettors.map((bettor) => [bettor.userId, bettor.amount])));
}
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
  const defaultTimeoutMs = process.env.VERCEL === "1" ? 90_000 : 45_000;
  return age <= Number(process.env.WORKER_HEARTBEAT_TIMEOUT_MS ?? defaultTimeoutMs) ? { status: "healthy", workerId: heartbeat.workerId, heartbeatAt: heartbeat.heartbeatAt } : { status: "unavailable", workerId: heartbeat.workerId, heartbeatAt: heartbeat.heartbeatAt };
}

function telegramUpdateType(update: Record<string, unknown>): "message" | "callback_query" | "my_chat_member" | "unknown" {
  if (update.message) return "message";
  if (update.callback_query) return "callback_query";
  if (update.my_chat_member) return "my_chat_member";
  return "unknown";
}

export const apiHandler = async (request: IncomingMessage, response: ServerResponse) => {
  try {
    responseCorsOrigins.set(response, corsOrigin(request));
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const originalPath = url.pathname;
    let forcedVerificationStatus: Exclude<VerificationSnapshot["status"], "NOT_SUBMITTED"> | undefined;
    const adminReviewAlias = /^\/api\/admin\/verifications\/([^/]+)\/(approve|reject)$/.exec(originalPath);
    if (adminReviewAlias) {
      forcedVerificationStatus = adminReviewAlias[2] === "approve" ? "APPROVED" : "REJECTED";
      url.pathname = `/api/admin/verification/${adminReviewAlias[1]}/review`;
    } else if (originalPath === "/api/verification") {
      url.pathname = request.method === "GET" ? "/api/verification/status" : "/api/verification/submit";
    } else if (originalPath === "/api/verification/resubmit") {
      url.pathname = "/api/verification/submit";
    } else if (originalPath === "/api/chat/rooms" && request.method === "GET") {
      url.pathname = "/api/rooms";
    } else if (originalPath === "/api/referral") {
      url.pathname = "/api/referrals";
    } else if (originalPath === "/api/leaderboards") {
      url.pathname = "/api/leaderboard";
    } else {
      const roomMessagesAlias = /^\/api\/chat\/rooms\/([^/]+)\/messages$/.exec(originalPath);
      if (roomMessagesAlias?.[1] === "room-12") url.pathname = request.method === "GET" ? "/api/chat/room" : "/api/chat/room/command";
      const roomRealtimeAlias = /^\/api\/chat\/rooms\/([^/]+)\/realtime$/.exec(originalPath);
      if (roomRealtimeAlias?.[1] === "room-12") url.pathname = "/api/chat/room/realtime";
      const gameRoomAlias = /^\/api\/game\/rooms\/([^/]+)$/.exec(originalPath);
      if (gameRoomAlias?.[1] === "room-12") url.pathname = "/api/rooms/room-12";
      const claimAlias = /^\/api\/rounds\/([^/]+)\/claim$/.exec(originalPath);
      if (claimAlias) url.pathname = `/api/rounds/${claimAlias[1]}/packet-claim`;
    }
    response.setHeader("x-request-id", header(request, "x-request-id") ?? randomBytes(12).toString("hex"));
    if (request.method === "OPTIONS") return json(response, 204, {});
    if (request.method === "POST" && !allowRateLimit(request)) return json(response, 429, { error: "Rate limit exceeded" });
    const healthPath = url.pathname.replace(/^\/api(?=\/|$)/, "");
    if (request.method === "GET" && healthPath === "/version") return json(response, 200, { version: appVersion, buildId, deployedAt });
    if (request.method === "GET" && healthPath === "/internal/round-advancer") {
      const authorization = header(request, "authorization") ?? "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
      const acceptedTokens = [process.env.CRON_SECRET, process.env.INTERNAL_WORKER_SECRET].filter((value): value is string => Boolean(value?.trim()));
      if (!token || !acceptedTokens.some((accepted) => safeEqualText(token, accepted))) return json(response, 401, { code: "INTERNAL_WORKER_UNAUTHORIZED", error: "Internal scheduler authorization is required" });
      if (appMode === "demo") return json(response, 409, { code: "DEMO_AUTOMATION_DISABLED", error: "The production round advancer is unavailable in demo mode" });
      if (!persistence.configured) return json(response, 503, { code: "DATABASE_REQUIRED", error: "Persistent round storage is not configured" });
      if (!process.env.PROJECT12_SERVER_SEED?.trim()) return json(response, 503, { code: "SERVER_SEED_REQUIRED", error: "Production server seed is not configured" });
      const workerId = `vercel-cron-${buildId.slice(0, 12)}`;
      const tick = await runWorkerTick();
      return json(response, 200, { ok: true, mode: appMode, workerId, ...tick });
    }
    const activeSession = await resolveSession(request);
    const runtime = persistence.configured && activeSession ? createRequestRuntime() : fallbackRuntime;
    if (!healthPath.startsWith("/health")) await hydrateRuntime(runtime);
    return await runtimeStorage.run(runtime, async () => {
    if (activeSession) await hydrateUserRuntime(activeSession.userId, runtime);
    await advanceDemoRoundIfDue();
    if (request.method === "GET" && healthPath === "/health/live") return json(response, 200, { ok: true, service: "api", mode: appMode });
    if (request.method === "GET" && healthPath === "/health/worker") { const worker = await workerHealth(); return json(response, worker.status === "unavailable" ? 503 : 200, { ok: worker.status !== "unavailable", service: "worker", ...worker }); }
    if (request.method === "GET" && (healthPath === "/health/ready" || healthPath === "/health")) { const databaseHealth = await persistence.health(); const worker = await workerHealth(); const botConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN); const workerRequired = process.env.REQUIRE_WORKER === "true"; const missingConfig = missingProductionConfig(); const internalChat = persistence.configured ? "configured" : appMode === "demo" ? "demo-only" : "not_configured"; const ready = appMode === "demo" ? true : missingConfig.length === 0 && databaseHealth === "healthy" && botConfigured && (!workerRequired || worker.status === "healthy"); return json(response, ready ? 200 : 503, { ok: ready, mode: appMode, realMoneyDisabled, missingConfig, services: { api: ready ? "healthy" : "blocked", worker: worker.status, workerRequired, bot: botConfigured ? "configured" : "not_configured", internalChat, legacyNativeGroupChat: "disabled_by_architecture", ledger: "balanced", packetProvider: packetProvider.status, database: databaseHealth }, auth: { telegramSignedDataRequired: true, mockEnabled: telegramMockEnabled } }); }

    if (request.method === "POST" && url.pathname === "/api/auth/telegram") { if (appMode !== "demo" && !persistence.configured) return json(response, 503, { code: "DATABASE_REQUIRED", error: "Persistent authentication storage is not configured" }); const data = await body(request); let identity: { userId: string; username?: string }; let mode: "telegram-verified" | "mock"; if (process.env.TELEGRAM_BOT_TOKEN && typeof data.initData === "string" && data.initData.trim()) { identity = validateTelegramInitData(data.initData, process.env.TELEGRAM_BOT_TOKEN, Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ?? 86400)); mode = "telegram-verified"; } else if (typeof data.launchToken === "string" && data.launchToken.trim()) { const launchUserId = await persistence.consumeWebAppLaunchGrant(data.launchToken.trim()); if (!launchUserId) return json(response, 401, { code: "INVALID_LAUNCH_GRANT", error: "This Telegram launch button has expired or was already used" }); identity = { userId: launchUserId }; mode = "telegram-verified"; } else if (telegramMockEnabled) { identity = { userId: typeof data.demoUser === "string" ? data.demoUser : "demo-player-01", username: "demo_player" }; mode = "mock"; } else return json(response, 503, { code: "TELEGRAM_SIGNED_INIT_DATA_REQUIRED", error: "Signed Telegram initData or a valid Telegram launch grant is required outside demo mode" }); const locale = normalizeAppLocale(data.locale); const expiresAt = Date.now() + 86_400_000; const token = appMode === "demo" && !persistence.configured ? createDemoSessionToken(identity.userId, expiresAt) : randomBytes(32).toString("hex"); sessions.set(token, { userId: identity.userId, role: "PLAYER", expiresAt }); preferredLocales.set(identity.userId, locale); await persistence.upsertTelegramIdentity(identity.userId, identity.username, mode === "telegram-verified", locale); await persistence.createSession(identity.userId, token, new Date(expiresAt)); const startParam = typeof data.startParam === "string" ? data.startParam.trim() : ""; const pendingReferral = startParam.replace(/^ref_/, ""); const onboardingEntry = onboardingState(identity.userId); if (pendingReferral) onboardingEntry.pendingReferral = pendingReferral; const secureSession = appMode !== "demo" || process.env.NODE_ENV === "production"; response.setHeader("set-cookie", `p12_session=${token}; HttpOnly; SameSite=${secureSession ? "None" : "Lax"}; Path=/; Max-Age=86400${secureSession ? "; Secure" : ""}`); return json(response, 200, { token: appMode === "demo" ? token : undefined, mode, locale, user: { id: identity.userId, username: identity.username }, startParam, session: "HttpOnly cookie", persistence: persistence.configured ? "postgres" : "not_configured" }); }
    if (request.method === "GET" && url.pathname === "/api/preferences/locale") { const identity = requirePlayer(request, response); if (!identity) return undefined; const persisted = preferredLocales.get(identity.userId) ?? await persistence.loadUserLocale(identity.userId); const locale = normalizeAppLocale(persisted); preferredLocales.set(identity.userId, locale); return json(response, 200, { locale }); }
    if (request.method === "POST" && url.pathname === "/api/preferences/locale") { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async () => { const locale = normalizeAppLocale((await body(request)).locale); preferredLocales.set(identity.userId, locale); await persistence.persistUserLocale(identity.userId, locale); return { locale }; }); }
    if (request.method === "GET" && url.pathname === "/api/me") return activeSession ? json(response, 200, { ...state.user, id: activeSession.userId }) : json(response, 401, { error: "Unauthorized" });
    if (request.method === "GET" && url.pathname === "/api/onboarding/status") { const identity = requirePlayer(request, response); return identity ? json(response, 200, onboardingState(identity.userId)) : undefined; }
    if (request.method === "GET" && url.pathname === "/api/verification/status") { const identity = requirePlayer(request, response); if (!identity) return undefined; const verification = await verificationState(identity.userId); return json(response, 200, { ...verification, canUseChat: verification.status === "APPROVED", canUseWallet: verification.status === "APPROVED" }); }
    if (request.method === "GET" && url.pathname === "/api/realtime/token") {
      const identity = await requireVerifiedPlayer(request, response);
      if (!identity) return undefined;
    await persistence.ensureRoomMember(identity.userId, state.round.id);
      const databaseUserId = await persistence.resolveDatabaseUserId(identity.userId);
      const token = databaseUserId ? createSupabaseRealtimeToken(databaseUserId) : undefined;
      if (!token) return json(response, 503, { code: "REALTIME_AUTH_NOT_CONFIGURED", error: "Private Realtime authentication is not configured" });
      return json(response, 200, token);
    }
    if (request.method === "POST" && url.pathname === "/api/verification/submit") { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const data = verificationInput(await body(request)); const current = await verificationState(identity.userId); if (current.status === "APPROVED") { if (appMode === "demo" && identity.userId === demoVerifiedUserId) return current; throw new Error("实名认证已经通过"); } if (current.status === "SUSPENDED") throw new Error("当前账户暂时受限，无法重新提交实名认证"); const next: VerificationSnapshot = persistence.configured ? await persistence.persistVerification(identity.userId, data.legalName, data.tngAccountNo) : appMode === "demo" && identity.userId === demoVerifiedUserId ? { status: "APPROVED", submittedAt: now(), tngAccountLast4: maskTngAccount(data.tngAccountNo) } : { status: "PENDING", submittedAt: now(), tngAccountLast4: maskTngAccount(data.tngAccountNo) }; verificationStates.set(identity.userId, next); audit(identity.userId, "IDENTITY_VERIFICATION_SUBMITTED", "IDENTITY_VERIFICATION", identity.userId, undefined, { status: next.status, tngAccountLast4: next.tngAccountLast4, idempotencyKey: key }); await addRoomMessage("SYSTEM", next.status === "APPROVED" ? "平台通知：实名验证已通过，可进入游戏聊天室。" : "平台通知：新的玩家已提交实名认证，审核通过后可进入游戏聊天室。", { status: next.status }); return next; }); }
    if (request.method === "GET" && url.pathname === "/api/admin/verifications") { if (!requireAdmin(request)) return json(response, 403, { error: "Admin authorization required" }); const requestedStatus = url.searchParams.get("status") as VerificationSnapshot["status"] | null; const allowed = new Set<VerificationSnapshot["status"]>(["PENDING", "APPROVED", "REJECTED", "NEEDS_MORE_INFO", "SUSPENDED"]); const status = requestedStatus && allowed.has(requestedStatus) ? requestedStatus : undefined; if (persistence.configured) return json(response, 200, await persistence.listVerificationCases(status)); return json(response, 200, [...verificationStates.entries()].filter(([, item]) => !status || item.status === status).map(([telegramUserId, item]) => ({ telegramUserId, ...item, tngAccountMasked: item.tngAccountLast4 }))); }
    if (request.method === "POST" && url.pathname.startsWith("/api/admin/verification/") && url.pathname.endsWith("/review")) { if (!requireAdmin(request)) return json(response, 403, { error: "Admin approval required" }); const telegramUserId = decodeURIComponent(url.pathname.split("/")[4] ?? ""); return writeIdempotent(request, response, async (key) => { const data = await body(request); const allowed = new Set<VerificationSnapshot["status"]>(["APPROVED", "REJECTED", "NEEDS_MORE_INFO", "SUSPENDED"]); const status = forcedVerificationStatus ?? (typeof data.status === "string" && allowed.has(data.status as VerificationSnapshot["status"]) ? data.status as Exclude<VerificationSnapshot["status"], "NOT_SUBMITTED"> : undefined); if (!status) throw new Error("Invalid verification review status"); const reason = typeof data.reason === "string" ? data.reason.slice(0, 200) : undefined; const previous = await verificationState(telegramUserId); const next: VerificationSnapshot = persistence.configured ? (await persistence.reviewVerificationCase(telegramUserId, status, "demo-admin", reason) ?? { status: "NOT_SUBMITTED" }) : { status, ...(reason ? { rejectionReason: reason } : {}) }; verificationStates.set(telegramUserId, next); audit("demo-admin", "IDENTITY_VERIFICATION_REVIEWED", "IDENTITY_VERIFICATION", telegramUserId, { status: previous.status }, { status: next.status, reason, idempotencyKey: key }); if (previous.status !== "APPROVED" && next.status === "APPROVED") queueOutbox("IDENTITY_VERIFICATION_APPROVED", { telegramUserId, locale: preferredLocales.get(telegramUserId) ?? "zh-CN", notificationId: `verification:${telegramUserId}:${next.submittedAt ?? now()}` }); return next; }); }
    if (request.method === "POST" && url.pathname === "/api/onboarding/device-bind") { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const data = await body(request); const publicKey = typeof data.publicKey === "string" ? data.publicKey.trim() : ""; if (publicKey.length < 32) throw new Error("Device public key is required"); const existing = deviceBindings.get(publicKey); if (existing && existing.userId !== identity.userId) throw new Error("Device is already bound to another account"); const current = onboardingState(identity.userId); if (!existing) deviceBindings.set(publicKey, { userId: identity.userId, publicKey, boundAt: now() }); await persistence.persistDevice(identity.userId, publicKey); current.deviceBound = true; audit(identity.userId, "DEVICE_BOUND", "DEVICE", createHash("sha256").update(publicKey).digest("hex").slice(0, 16), undefined, { idempotencyKey: key, keyType: "public-key" }); return { status: "BOUND", deviceBound: true, devicePublicKey: publicKey }; }); }
    if (request.method === "POST" && url.pathname === "/api/onboarding/referrer") { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const data = await body(request); const current = onboardingState(identity.userId); const code = (typeof data.code === "string" ? data.code.trim() : "") || current.pendingReferral || ""; if (!code) throw new Error("Referral code is required"); if (current.referrerBound) return { status: "ALREADY_BOUND" }; if (appMode !== "demo" && /demo/i.test(code)) throw new Error("Referral code not found"); if (appMode !== "demo") { await persistence.persistReferral(identity.userId, code, "ONBOARDING"); current.referrerBound = true; current.pendingReferral = undefined; audit(identity.userId, "ONBOARDING_REFERRER_BOUND", "REFERRAL", identity.userId, undefined, { code, idempotencyKey: key }); return { status: "BOUND", referrerBound: true, code }; } const known = code === "DEMO-INVITE" || /^P12-DEMO-\d{2}$/.test(code); if (!known) throw new Error("Referral code not found"); current.referrerBound = true; current.pendingReferral = undefined; referralEdges.push({ referrerUserId: code === "DEMO-INVITE" ? "demo-referrer-01" : code, referredUserId: identity.userId, code, status: "PENDING", source: "ONBOARDING" }); await persistence.persistReferral(identity.userId, code, "ONBOARDING"); audit(identity.userId, "ONBOARDING_REFERRER_BOUND", "REFERRAL", identity.userId, undefined, { code, idempotencyKey: key }); return { status: "BOUND", referrerBound: true, code }; }); }
    if (request.method === "POST" && url.pathname === "/api/onboarding/pin") { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const data = await body(request); if (!validPin(data.pin)) throw new Error("PIN must be six digits and not a repeated or sequential demo PIN"); const current = onboardingState(identity.userId); const encodedHash = await hashPin(data.pin); securityPins.set(identity.userId, { hash: encodedHash, changedAt: now() }); await persistence.persistPin(identity.userId, encodedHash); current.pinSet = true; audit(identity.userId, "SECURITY_PIN_SET", "USER", identity.userId, undefined, { idempotencyKey: key, algorithm: "scrypt" }); return { status: "SET", pinSet: true }; }); }
    if (request.method === "GET" && url.pathname === "/api/hall") { if (appMode === "production" && !state.round.id) return json(response, 503, { code: "ROUND_NOT_READY", error: "游戏回合服务尚未就绪" }); return json(response, 200, hallSnapshot()); }
    if (request.method === "GET" && url.pathname === "/api/announcements") return json(response, 200, demoAnnouncements);
    if (request.method === "GET" && url.pathname === "/api/rooms") { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; if (appMode === "production" && !state.round.id) return json(response, 503, { code: "ROUND_NOT_READY", error: "游戏回合服务尚未就绪" }); return json(response, 200, [roomSummary()]); }
    if (request.method === "GET" && url.pathname === "/api/rooms/room-12") { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; if (appMode === "production" && !state.round.id) return json(response, 503, { code: "ROUND_NOT_READY", error: "游戏回合服务尚未就绪" }); return json(response, 200, roomSummary()); }
     if (request.method === "GET" && url.pathname === "/api/chat/room") { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; await persistence.ensureRoomMember(identity.userId); const before = url.searchParams.get("before") || undefined; const after = url.searchParams.get("after") || undefined; const limit = before ? 30 : 50; const loaded = persistence.configured ? await persistence.loadRoomMessages(undefined, identity.userId, before, limit, after) : roomMessages.filter((message) => canViewRoomMessage(message, identity.userId)).filter((message) => { const sequence = message.messageSeq ?? 0; return (!before || sequence < Number(before)) && (!after || sequence > Number(after)); }).sort((left, right) => (left.messageSeq ?? 0) - (right.messageSeq ?? 0)).slice(-(before ? 30 : 50)); const oldest = loaded[0]; const latest = loaded[loaded.length - 1]; return json(response, 200, { roomId: "room-12", roomName: "十二牛牛游戏群", roundId: state.round.id, state: state.round.state, banker: state.round.banker, bankPool: state.round.bankPool, messages: loaded, hasMore: Boolean(before ? loaded.length === limit : loaded.length === limit && oldest?.messageSeq && oldest.messageSeq > 1), nextCursor: oldest?.messageSeq ? String(oldest.messageSeq) : undefined, latestCursor: latest?.messageSeq ? String(latest.messageSeq) : undefined }); }
     if (request.method === "GET" && url.pathname === "/api/chat/room/realtime") { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; await persistence.ensureRoomMember(identity.userId); response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": responseCorsOrigins.get(response) ?? process.env.CORS_ORIGIN ?? "http://localhost:4173", "access-control-allow-credentials": "true" }); const after = url.searchParams.get("after") || undefined; const initialMessages = persistence.configured ? await persistence.loadRoomMessages(undefined, identity.userId, undefined, 50, after) : roomMessages.filter((message) => canViewRoomMessage(message, identity.userId)).filter((message) => !after || (message.messageSeq ?? 0) > Number(after)).sort((left, right) => (left.messageSeq ?? 0) - (right.messageSeq ?? 0)).slice(-50); for (const message of initialMessages) writeRoomEvent(response, message); response.write(`event: snapshot\ndata: ${JSON.stringify({ roomId: "room-12", roundId: state.round.id, state: state.round.state, banker: state.round.banker, bankPool: state.round.bankPool, endsAt: state.round.endsAt })}\n\n`); if (url.searchParams.get("snapshot") === "1" || demoAutoRoundEnabled) { response.end(); return; } roomRealtimeClients.set(response, identity.userId); const heartbeat = setInterval(() => { if (response.writableEnded || response.destroyed) return; void advanceDemoRoundIfDue().catch((error: unknown) => console.error(`demo round automation failed: ${error instanceof Error ? error.message : String(error)}`)); response.write(`event: snapshot\ndata: ${JSON.stringify({ roomId: "room-12", roundId: state.round.id, state: state.round.state, banker: state.round.banker, bankPool: state.round.bankPool, endsAt: state.round.endsAt })}\n\n`); }, 1_000); response.on("close", () => { clearInterval(heartbeat); roomRealtimeClients.delete(response); }); return; }
     if (request.method === "POST" && url.pathname === "/api/chat/room/command") {
       const identity = await requireVerifiedPlayer(request, response);
       if (!identity) return undefined;
       return writeIdempotent(request, response, async (key) => {
          const data = await body(request);
          const attachment = await chatAttachmentInput(data);
           const text = typeof data.text === "string" ? data.text.trim().slice(0, 240) : typeof data.body === "string" ? data.body.trim().slice(0, 240) : "";
          if (attachment) {
            await addRoomMessage("USER", text || `📷 ${attachment.name}`, { messageType: "IMAGE", attachment }, identity.userId);
            return { command: "MESSAGE", result: { state: state.round.state, message: text, attachment: true } };
          }
          if (!text) throw new Error("请输入聊天消息或游戏指令");
          const numeric = /^(?:(?:sh|shove|梭哈|下注|bet)\s*)?(\d+)$/.exec(text.toLowerCase());
          const bankerNumeric = /^(?:(?:抢庄|竞庄|庄|bid)\s*)?(\d+)$/i.exec(text);
          const closeBankerCommand = /^(?:stop\s*banker|close\s*banker|停止抢庄|结束抢庄|结束竞价|抢庄结束|封盘抢庄)$/i.test(text);
          const closeCommand = /^(?:stop|close|停止下注|结束下注|下注结束|封盘)$/i.test(text);
          const restartCommand = /^(?:\/重推|重推|restart|reopen)$/i.test(text);
          const confirmCommand = /^(?:1|confirm|确认|确认发包|确认发红包|开始发红包)$/i.test(text);
          const claimCommand = /^(?:抢红包|领红包|开红包|claim|open|open\s*packet)$/i.test(text);
          if ((text === "1" || text === "0") && state.round.state === "ROUND_COMPLETE") {
            if (text === "1") {
              if (state.round.banker !== identity.userId) throw new Error("只有本局庄家可以续庄");
              await addRoomMessage("USER", text, { command: "CONTINUE", value: 1 }, identity.userId);
              return { command: "CONTINUE", result: await startNextRound(identity.userId) };
            }
            await addRoomMessage("USER", text, { command: "END_TABLE", value: 0 }, identity.userId);
            await addRoomMessage("ROUND", "本桌已结束，感谢参与。", { templateKey: "game.table.ended", roundId: state.round.id });
            return { command: "END_TABLE", result: { state: state.round.state, ended: true } };
          }
          if (bankerNumeric && state.round.state === "BANKER_BIDDING") {
            const amount = Number(bankerNumeric[1]);
           const result = await executeBid(identity, key, amount);
           await addRoomMessage("USER", text, { command: "BID", amount }, identity.userId);
           return { command: "BID", result };
         }
         if (closeBankerCommand && state.round.state === "BANKER_BIDDING") {
           const result = await executeCloseBankerBidding(identity, key);
           await addRoomMessage("USER", text, { command: "CLOSE_BANKER_BIDDING" }, identity.userId);
           return { command: "CLOSE_BANKER_BIDDING", result };
         }
         if (state.round.state === "BETTING") {
           const betCommand = parseChatBetCommand(text);
           if (betCommand) {
             const result = await executeBet(identity, key, betCommand.amount, "CHAT");
             await addRoomMessage("USER", text, { command: "BET", amount: betCommand.amount, mode: betCommand.mode }, identity.userId);
             return { command: "BET", result };
           }
         }
         if (closeCommand && state.round.state === "BETTING") {
           const result = await executeCloseBetting(identity, key);
           await addRoomMessage("USER", text, { command: "CLOSE_BETTING" }, identity.userId);
           return { command: "CLOSE_BETTING", result };
         }
         if (confirmCommand && state.round.state === "WAITING_BANKER_CONFIRM") {
           const result = await executeConfirmPacket(identity, key);
           await addRoomMessage("USER", text, { command: "CONFIRM_PACKET" }, identity.userId);
           return { command: "CONFIRM_PACKET", result };
         }
         if (claimCommand && state.round.state === "CLAIMING") {
           const result = await executePacketClaim(identity, key);
           await addRoomMessage("USER", text, { command: "CLAIM_PACKET" }, identity.userId);
           return { command: "CLAIM_PACKET", result };
         }
         if (restartCommand && state.round.state === "WAITING_BANKER_CONFIRM") {
           if (state.round.banker !== identity.userId) throw new Error("只有当前庄家可以重推本局");
           await transition("ROUND_CANCELLED", identity.userId, { reason: "banker requested restart", idempotencyKey: key });
           await addRoomMessage("USER", text, { command: "RESTART_ROUND" }, identity.userId);
           await addRoomMessage("ROUND", "本局已按庄家请求取消，等待下一局重新抢庄。", { templateKey: "game.round.cancelled", roundId: state.round.id });
           return { command: "RESTART_ROUND", result: { state: state.round.state, cancelled: true } };
         }
         if (/^(?:help|帮助|玩法)$/i.test(text)) {
           return {
             command: "HELP",
             result: {
               state: state.round.state,
               message: state.round.state === "BANKER_BIDDING" ? "在聊天室发送数字或“抢庄 600”；最高者发送“结束抢庄”" : state.round.state === "BETTING" ? "在聊天室发送 2–17 或“下注 5”，也可发送 sh10 / 梭哈 50；庄家发送“停止下注”或“封盘”" : state.round.state === "WAITING_BANKER_CONFIRM" ? "请庄家在聊天室发送任意文字确认发包，或发送 /重推 取消本局" : state.round.state === "CLAIMING" ? "本局参与者在聊天室发送“抢红包”领取内部红包" : "请等待本局继续"
             }
           };
         }
         if (state.round.state === "WAITING_BANKER_CONFIRM" && state.round.banker === identity.userId) {
           const result = await executeConfirmPacket(identity, key);
           await addRoomMessage("USER", text, { command: "CONFIRM_PACKET", confirmation: "ANY_NON_EMPTY_MESSAGE" }, identity.userId);
           return { command: "CONFIRM_PACKET", result };
         }
         const looksLikeGameInput = numeric || bankerNumeric || closeBankerCommand || closeCommand || restartCommand || confirmCommand || claimCommand || /^(?:help|帮助|玩法)$/i.test(text);
          if (!looksLikeGameInput && !text.startsWith("/")) {
            await addRoomMessage("USER", text, { messageType: "CHAT" }, identity.userId);
            return { command: "MESSAGE", result: { state: state.round.state, message: text } };
          }
          throw new Error(state.round.state === "BANKER_BIDDING" ? "抢庄阶段请输入整数庄金，例如 600，或由当前最高庄金玩家发送 结束抢庄" : state.round.state === "BETTING" ? "下注格式：发送 2–17，或发送 sh10–sh177；每局只能下注一次" : state.round.state === "WAITING_BANKER_CONFIRM" ? "请庄家发送任意文字确认发包或 /重推" : state.round.state === "CLAIMING" ? "本局参与者发送 抢红包 领取内部红包" : "当前阶段不接受聊天室指令");
       });
     }
     const chatReadAlias = /^\/api\/chat\/rooms\/([^/]+)\/read$/.exec(originalPath);
      if (request.method === "POST" && chatReadAlias?.[1] === "room-12") { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async () => { const data = await body(request); const lastMessageId = typeof data.lastMessageId === "string" ? data.lastMessageId : undefined; const lastMessageSeq = Number.isSafeInteger(Number(data.lastMessageSeq)) ? Number(data.lastMessageSeq) : undefined; await persistence.persistRoomRead(undefined, identity.userId, lastMessageId, lastMessageSeq); audit(identity.userId, "ROOM_MESSAGES_READ", "ROOM", "room-12", undefined, { lastMessageId, lastMessageSeq }); return { roomId: "room-12", readAt: now(), lastMessageId, lastMessageSeq }; }); }
    if (request.method === "POST" && url.pathname === "/api/rooms/room-12/join") { const identity = requirePlayer(request, response); return identity ? writeIdempotent(request, response, async () => { await persistence.ensureRoomMember(identity.userId); audit(identity.userId, "ROOM_JOINED", "ROOM", "room-12"); return { roomId: "room-12", roundId: state.round.id, joined: true, label: "PLAYER" }; }) : undefined; }
    if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}`) return json(response, 200, state.round);
    if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/events`) return json(response, 200, roundEvents);
    if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/realtime`) { response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": responseCorsOrigins.get(response) ?? process.env.CORS_ORIGIN ?? "http://localhost:4173", "access-control-allow-credentials": "true" }); for (const event of [...roundEvents].reverse()) writeRoundEvent(response, event); response.write(`event: snapshot\ndata: ${JSON.stringify({ round: state.round, outboxPending: outboxEvents.filter((event) => !event.publishedAt).length })}\n\n`); if (url.searchParams.get("snapshot") === "1") { response.end(); return; } realtimeClients.add(response); const heartbeat = setInterval(() => { if (!response.writableEnded && !response.destroyed) response.write(": heartbeat\n\n"); }, 15_000); response.on("close", () => { clearInterval(heartbeat); realtimeClients.delete(response); }); return; }
    if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/fairness`) return json(response, 200, { ruleVersion: appMode === "demo" ? demoRules.id : state.round.ruleVersion, seedHash: hashSeed(serverSeed), revealed: ["ROUND_COMPLETE", "REFUNDED"].includes(state.round.state), serverSeed: ["ROUND_COMPLETE", "REFUNDED"].includes(state.round.state) ? serverSeed : undefined, inputTemplate: `${state.round.id}:<userId>:<claimSequence>` });
      if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/settlement`) return json(response, 200, { roundId: state.round.id, state: state.round.state, ledger: state.ledger.slice(0, 5), events: roundEvents.slice(0, 10), results: await readRoundResults(state.round.id), ...(appMode === "demo" ? { demoOnly: true } : {}) });
    if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/results`) { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; const results = await readRoundResults(state.round.id); return json(response, 200, { roundId: state.round.id, state: state.round.state, banker: state.round.banker, results, visible: results.length > 0 }); }
     if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/banker-summary`) { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; if (identity.userId !== state.round.banker) return json(response, 403, { error: "Only the banker can view the banker summary" }); const bettors = await roundBettorRows(); return json(response, 200, { roundId: state.round.id, banker: state.round.banker, bettors, totalBets: bettors.reduce((sum, row) => sum + row.amount, 0), results: await readRoundResults(state.round.id) }); }
    if (request.method === "GET" && url.pathname === "/api/admin/overview") { if (!requireAdmin(request)) return json(response, 403, { error: "Admin authorization required" }); const worker = await workerHealth(); return json(response, 200, { mode: appMode, realMoneyDisabled, databaseConfigured: persistence.configured, database: await persistence.health(), worker, room: roomSummary(), counts: { messages: roomMessages.length, roundEvents: roundEvents.length, pendingOutbox: outboxEvents.filter((event) => !event.publishedAt).length, riskFlags: riskFlags.filter((flag) => flag.status !== "CLOSED").length, bettors: (await roundBettorRows()).length }, invariants: { ledgerBalanced: true, internalPacketOnly: true, productionWritesDisabled: appMode !== "production" } }); }
    if (request.method === "GET" && url.pathname === "/api/admin/rooms") return requireAdmin(request) ? json(response, 200, [roomSummary()]) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === "/api/admin/rooms/room-12/live") { if (!requireAdmin(request)) return json(response, 403, { error: "Admin authorization required" }); const worker = await workerHealth(); return json(response, 200, { room: roomSummary(), worker, messages: roomMessages.slice(-100), events: roundEvents.slice(0, 50), connections: { sse: roomRealtimeClients.size, supabaseConfigured: hasSupabaseRealtime() }, demoOnly: appMode === "demo" }); }
    if (request.method === "GET" && url.pathname === "/api/admin/jobs") return requireAdmin(request) ? json(response, 200, { worker: await workerHealth(), pendingOutbox: outboxEvents.filter((event) => !event.publishedAt), currentRound: state.round, lastRoundEvents: roundEvents.slice(0, 20) }) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === "/api/admin/chat") return requireAdmin(request) ? json(response, 200, { roomId: "room-12", messages: roomMessages.slice(-200), latestMessageSeq: nextDemoMessageSeq }) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === "/api/admin/rules") return requireAdmin(request) ? json(response, 200, [{ id: appMode === "demo" ? demoRules.id : "12-niuniu-v1", version: appMode === "demo" ? demoRules.id : "12-niuniu-v1", status: "ACTIVE", rules: demoRules, immutable: true, ...(appMode === "demo" ? { demoOnly: true } : {}) }]) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === "/api/admin/outbox") return requireAdmin(request) ? json(response, 200, outboxEvents) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "POST" && url.pathname === "/api/admin/outbox/publish") return requireAdmin(request) ? writeIdempotent(request, response, (key) => { const published = outboxEvents.filter((event) => !event.publishedAt).map((event) => { event.publishedAt = now(); return event.id; }); audit("admin", "OUTBOX_PUBLISHED", "OUTBOX", key, undefined, { count: published.length }); return { published }; }) : json(response, 403, { error: "Admin authorization required" });

     if (request.method === "POST" && url.pathname === `/api/rounds/${state.round.id}/bid`) { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => executeBid(identity, key, Number((await body(request)).amount ?? 100))); }
     if (request.method === "POST" && url.pathname === `/api/rounds/${state.round.id}/close-banker-bidding`) { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => executeCloseBankerBidding(identity, key)); }
     if (request.method === "POST" && url.pathname === `/api/rounds/${state.round.id}/bet`) { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => executeBet(identity, key, Number((await body(request)).amount ?? 250))); }
     if (request.method === "POST" && url.pathname === `/api/rounds/${state.round.id}/close-betting`) { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => executeCloseBetting(identity, key)); }
     if (request.method === "GET" && url.pathname === `/api/rounds/${state.round.id}/packet`) { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; const packet = await packetProvider.getPacket(state.round.id); if (packet) packetIds.set(state.round.id, packet.id); const persistedBettors = persistence.configured ? await persistence.listRoundBettors() : []; const bettorIds = persistedBettors.length > 0 ? persistedBettors.map((row) => row.userId) : [...(roundBettors.get(state.round.id) ?? new Map<string, number>()).keys()]; const eligible = bettorIds.includes(identity.userId); return json(response, 200, { state: state.round.state, packet: eligible ? packet : null, eligible, bettorCount: bettorIds.length }); }
     if (request.method === "POST" && (url.pathname === `/api/rounds/${state.round.id}/packet-claim` || (appMode === "demo" && url.pathname === `/api/rounds/${state.round.id}/demo-claim`))) { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, (key) => executePacketClaim(identity, key)); }
     if (request.method === "POST" && url.pathname === `/api/rounds/${state.round.id}/settle`) { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { if (state.round.state !== "EVALUATING") throw new Error("Round is not ready to settle"); const amountLocked = balances.USER_LOCKED; if (amountLocked <= 0) throw new Error("No locked internal-points bet to settle"); const result = settlePlayer({ stake: amountLocked, player: { type: "普通点数", points: 9, amount: 3.42 }, banker: { type: "普通点数", points: 8, amount: 2.22 }, bankerPool: balances.BANKER_POOL }); const journal = createSettlementJournal(key, result); await transition("SETTLING", identity.userId, { journalId: journal.id, outcome: result.outcome }); Object.assign(balances, applyJournal(balances, journal)); await persistence.persistHand(identity.userId, 9, "普通点数", [3, 4, 2]); await persistence.persistSettlement(identity.userId, result.outcome); await persistence.persistJournal(journal, identity.userId); syncUserBalances(); await transition("ROUND_COMPLETE", identity.userId, { journalId: journal.id, outcome: result.outcome }); state.round.bankPool = balances.BANKER_POOL; const balanceChange = journal.lines.filter((line) => line.account === "USER_AVAILABLE" && line.direction === "CREDIT").reduce((sum, line) => sum + line.amount, 0); state.ledger.unshift({ id: journal.id, reason: journal.reason, change: balanceChange, balanceAfter: state.user.available, createdAt: "Just now" }); const mission = state.missions.find((item) => item.id === "rounds"); if (mission) mission.progress = Math.min(mission.target, mission.progress + 1); const player = state.leaderboard?.find((item) => item.userId === state.user.id); if (player) player.points += Math.round(result.netReward); audit(identity.userId, "ROUND_SETTLED", "JOURNAL", journal.id, undefined, { journal, result }); return { state: state.round.state, outcome: result.outcome, settlement: result, journal }; }); }
     if (request.method === "POST" && url.pathname === `/api/rounds/${state.round.id}/cancel`) { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { if (!["BETTING", "WAITING_BANKER_CONFIRM", "PACKET_SENT", "CLAIMING", "EVALUATING"].includes(state.round.state)) throw new Error("Round cannot be cancelled in its current state"); await transition("ROUND_CANCELLED", identity.userId, { reason: "operator cancellation" }); const packetId = packetIds.get(state.round.id); if (packetId) await packetProvider.cancelPacket(packetId); let journal: Journal | undefined; if (balances.USER_LOCKED > 0) { await transition("REFUNDING", identity.userId); journal = createRefundJournal(key, balances.USER_LOCKED); Object.assign(balances, applyJournal(balances, journal)); await persistence.persistJournal(journal, identity.userId); syncUserBalances(); state.ledger.unshift({ id: journal.id, reason: journal.reason, change: journal.lines[1].amount, balanceAfter: state.user.available, createdAt: "Just now" }); audit(identity.userId, "ROUND_REFUNDED", "JOURNAL", journal.id, undefined, journal); } await transition("REFUNDED", identity.userId); return { state: state.round.state, journal, refunded: true, packetCancelled: Boolean(packetId) }; }); }

    if (request.method === "GET" && url.pathname === "/api/wallet") { const identity = await requireVerifiedPlayer(request, response); return identity ? json(response, 200, { available: state.user.available, locked: state.user.locked, label: "INTERNAL POINTS · NO CASH VALUE" }) : undefined; }
    if (request.method === "GET" && url.pathname === "/api/wallet/ledger") { const identity = await requireVerifiedPlayer(request, response); return identity ? json(response, 200, state.ledger) : undefined; }
    if (request.method === "GET" && url.pathname === "/api/missions") return json(response, 200, state.missions);
     if (request.method === "POST" && url.pathname.startsWith("/api/missions/") && url.pathname.endsWith("/claim")) { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const missionId = url.pathname.split("/")[3]; const mission = state.missions.find((item) => item.id === missionId); if (!mission) throw new Error("Mission not found"); if (mission.progress < mission.target) throw new Error("Mission is not complete"); if (rewardClaims.has(missionId)) return { missionId, status: "ALREADY_CLAIMED" }; const journal = createTransferJournal({ id: `J-${missionId.toUpperCase()}`, referenceType: "MISSION_REWARD", referenceId: missionId, idempotencyKey: key, reason: "Mission reward", from: "CAMPAIGN_REWARD_RESERVE", to: "USER_AVAILABLE", amount: mission.reward }); Object.assign(balances, applyJournal(balances, journal)); await persistence.persistJournal(journal, identity.userId); syncUserBalances(); rewardClaims.add(missionId); state.ledger.unshift({ id: journal.id, reason: journal.reason, change: mission.reward, balanceAfter: state.user.available, createdAt: "Just now" }); audit(identity.userId, "MISSION_REWARD_CLAIMED", "MISSION", missionId, undefined, journal); return { missionId, reward: mission.reward, status: "CLAIMED", journal }; }); }
    if (request.method === "GET" && url.pathname === "/api/referrals") { const identity = requirePlayer(request, response); return identity ? json(response, 200, { ...state.referrals, bound: referralEdges.find((edge) => edge.referredUserId === identity.userId) ?? null }) : undefined; }
    if (request.method === "POST" && url.pathname === "/api/referrals/bind") { const identity = requirePlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async () => { const data = await body(request); const code = typeof data.code === "string" ? data.code.trim() : ""; if (!code) throw new Error("Referral code is required"); if (code === state.referrals.code) throw new Error("Self-referral is not allowed"); if (referralEdges.some((edge) => edge.referredUserId === identity.userId)) return { status: "ALREADY_BOUND" }; if (code !== "DEMO-INVITE") throw new Error("Referral code not found"); const edge = { referrerUserId: "demo-referrer-01", referredUserId: identity.userId, code, status: "PENDING" as const, source: "MANUAL" }; referralEdges.push(edge); audit(identity.userId, "REFERRAL_BOUND", "REFERRAL", identity.userId, undefined, edge); return { status: "BOUND", edge }; }); }
    if (request.method === "GET" && url.pathname === "/api/referrals/tree") { const identity = requirePlayer(request, response); return identity ? json(response, 200, { root: identity.userId, children: [{ id: "demo-ref-01", status: "QUALIFIED" }, { id: "demo-ref-02", status: "PENDING" }] }) : undefined; }
    if (request.method === "GET" && url.pathname === "/api/leaderboard") return json(response, 200, state.leaderboard ?? []);
    if (request.method === "GET" && url.pathname === "/api/rooms/room-12/leaderboard") { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; const category = url.searchParams.get("category"); if (category !== "points" && category !== "cards" && category !== "banker") return json(response, 400, { error: "Unsupported leaderboard category" }); return json(response, 200, roomLeaderboard(category)); }
    if (request.method === "GET" && ["/api/rewards/daily", "/api/rooms/room-12/rewards/daily"].includes(url.pathname)) { const identity = await requireVerifiedPlayer(request, response); return identity ? json(response, 200, dailyRewardSnapshot()) : undefined; }
     if (request.method === "POST" && /^\/api\/rooms\/room-12\/rewards\/daily\/[^/]+\/claim$/.test(url.pathname)) { const identity = await requireVerifiedPlayer(request, response); if (!identity) return undefined; return writeIdempotent(request, response, async (key) => { const rewardId = url.pathname.split("/").at(-2) ?? ""; const reward = dailyRewardSnapshot().rewards.find((item) => item.id === rewardId); if (!reward) throw new Error("Daily reward not found"); if (!reward.available && !reward.claimed) throw new Error("Daily reward is not ready"); if (reward.claimed) return { rewardId, status: "ALREADY_CLAIMED" }; const journal = createTransferJournal({ id: `J-DAILY-${rewardId.toUpperCase()}`, referenceType: "DAILY_REWARD", referenceId: rewardId, idempotencyKey: key, reason: "Daily reward", from: "CAMPAIGN_REWARD_RESERVE", to: "USER_AVAILABLE", amount: reward.reward }); Object.assign(balances, applyJournal(balances, journal)); await persistence.persistJournal(journal, identity.userId); dailyRewardClaims.add(rewardId); syncUserBalances(); state.ledger.unshift({ id: journal.id, reason: journal.reason, change: reward.reward, balanceAfter: state.user.available, createdAt: "Just now" }); audit(identity.userId, "DAILY_REWARD_CLAIMED", "REWARD", rewardId, undefined, journal); return { rewardId, status: "CLAIMED", reward: reward.reward, journal }; }); }
    if (request.method === "POST" && ["/api/wallet/top-up", "/api/wallet/withdraw", "/api/wallet/deposit-requests", "/api/wallet/withdraw-requests", "/api/wallet/withdrawal-requests", "/api/payments/charge", "/api/rewards/cash-out"].includes(url.pathname)) return rejectMoney(response);

    if (request.method === "GET" && url.pathname === "/api/admin/users") return requireAdmin(request) ? json(response, 200, [{ id: state.user.id, displayName: state.user.displayName, riskStatus: state.user.riskStatus, available: state.user.available, locked: state.user.locked }]) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === "/api/admin/rounds") return requireAdmin(request) ? json(response, 200, [state.round]) : json(response, 403, { error: "Admin authorization required" });
    if (request.method === "GET" && url.pathname === `/api/admin/rounds/${state.round.id}/reconstruct`) return requireAdmin(request) ? json(response, 200, { round: state.round, ruleVersion: appMode === "demo" ? demoRules : state.round.ruleVersion, events: [...roundEvents].reverse(), claims: await packetProvider.getClaims(packetIds.get(state.round.id) ?? ""), fairness: { seedHash: hashSeed(serverSeed), serverSeed: ["ROUND_COMPLETE", "REFUNDED"].includes(state.round.state) ? serverSeed : undefined }, ledger: state.ledger, outbox: outboxEvents }) : json(response, 403, { error: "Admin authorization required" });
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
  } catch (error) { if (error instanceof PacketProviderError) return json(response, error.code === "AUTHORIZATION_REQUIRED" ? 401 : error.code === "ROUND_PARTICIPANT_REQUIRED" ? 403 : 503, { code: error.code, error: error.message }); if (error instanceof Error && error.message.startsWith("ROUND_STATE_CONFLICT:")) return json(response, 409, { code: "ROUND_STATE_CONFLICT", error: error.message }); return json(response, 400, { error: error instanceof Error ? error.message : "Request failed" }); }
};

const server = createServer(apiHandler);
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, "0.0.0.0", () => console.log(`Project 12 API listening on ${port}`));
}
