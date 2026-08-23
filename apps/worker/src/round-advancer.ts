import type { QueryExecutor, Project12Database } from "../../../packages/database/src/index.js";
import type { RoundState } from "../../../packages/contracts/src/index.js";
import { classifyPacket, demoPacketValue, demoRoundHand, hashSeed, settlePlayer } from "../../../packages/game-engine/src/index.js";

type DueRound = { id: string; state: RoundState; state_version: number; state_ends_at: string | Date | null; banker_user_id?: string | null };
type InternalPacketRow = { id: string; total_amount: string | number; max_claims: string | number; claimed_amount: string | number; claimed_count: string | number };
type SettlementLine = { account: "USER_LOCKED" | "BANKER_POOL" | "USER_AVAILABLE" | "PLATFORM_FEE"; direction: "DEBIT" | "CREDIT"; amount: number; reason: string };

const appMode = process.env.APP_MODE ?? "demo";
const configuredServerSeed = process.env.PROJECT12_SERVER_SEED ?? (appMode === "demo" ? "project12-demo-seed-247" : "");

function workerServerSeed(): string {
  if (!configuredServerSeed) throw new Error("PROJECT12_SERVER_SEED is required outside demo mode");
  return configuredServerSeed;
}

function nextStateEnd(state: RoundState): Date | null {
  const seconds = nextStateDurationSeconds[state];
  return seconds === undefined ? null : new Date(Date.now() + seconds * 1000);
}

async function insertInternalChatMessage(client: QueryExecutor, roundId: string, body: string, payload: Record<string, unknown>): Promise<void> {
  const message = await client.query<{ id: string; message_seq: number; created_at: string | Date }>(`INSERT INTO room_messages (room_id, round_id, message_type, visibility, template_key, body, payload)
    SELECT room_id, id, 'ROUND', 'PUBLIC_ROOM', $2, $3, $4::jsonb FROM rounds WHERE id = $1 RETURNING id::text, message_seq, created_at`, [roundId, payload.templateKey ?? null, body, JSON.stringify(payload)]);
  const messageId = message.rows[0]?.id;
  if (!messageId) return;
  const event = { messageId, messageSeq: Number(message.rows[0].message_seq), roundId, type: "ROUND", body, payload, visibility: "PUBLIC_ROOM", createdAt: new Date(message.rows[0].created_at).toISOString() };
  await client.query("INSERT INTO outbox_events (event_type, payload) VALUES ('INTERNAL_CHAT_MESSAGE', $1::jsonb)", [JSON.stringify(event)]);
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (supabaseUrl && serviceKey) void fetch(`${supabaseUrl}/realtime/v1/api/broadcast?private=true`, { method: "POST", headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" }, body: JSON.stringify({ messages: [{ topic: "room-12", event: "message", payload: { message: { id: messageId, type: "ROUND", body, payload, visibility: "PUBLIC_ROOM", createdAt: new Date().toISOString() } } }] }) }).catch((error: unknown) => console.error(`supabase realtime broadcast failed: ${error instanceof Error ? error.message : String(error)}`));
}

async function insertStateEvent(client: QueryExecutor, roundId: string, from: RoundState, to: RoundState, stateVersion: number, workerId: string, payload: Record<string, unknown>): Promise<void> {
  await client.query("INSERT INTO round_events (round_id, from_state, to_state, payload, actor) VALUES ($1, $2, $3, $4::jsonb, $5)", [roundId, from, to, JSON.stringify(payload), `worker:${workerId}`]);
  await client.query("INSERT INTO outbox_events (event_type, payload) VALUES ('ROUND_STATE_CHANGED', $1::jsonb)", [JSON.stringify({ roundId, from, to, stateVersion, actor: `worker:${workerId}`, ...payload })]);
}

async function autoClaimExpiredRound(database: Project12Database, row: DueRound, workerId: string): Promise<boolean> {
  return database.transaction(async (client) => {
    const lock = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired", [row.id]);
    if (!lock.rows[0]?.acquired) return false;
    const currentRows = await client.query<DueRound>("SELECT id, state, state_version, state_ends_at, banker_user_id FROM rounds WHERE id = $1 FOR UPDATE", [row.id]);
    const current = currentRows.rows[0];
    if (!current || current.state !== "CLAIMING" || Number(current.state_version) !== Number(row.state_version) || !current.state_ends_at || new Date(current.state_ends_at).getTime() > Date.now()) return false;
    const packetRows = await client.query<InternalPacketRow>("SELECT id, total_amount, max_claims, claimed_amount, claimed_count FROM packet_records WHERE round_id = $1 FOR UPDATE", [row.id]);
    const packet = packetRows.rows[0];
    if (!packet) return false;
    const allocations = await client.query<{ id: string; user_id: string; claim_status: string; created_at: string | Date }>(`SELECT id, user_id, claim_status, created_at
      FROM packet_allocations WHERE round_id = $1 AND packet_id = $2 AND claim_status = 'ELIGIBLE' ORDER BY created_at, id`, [row.id, packet.id]);
    let claimedAmount = Number(packet.claimed_amount);
    let claimedCount = Number(packet.claimed_count);
    const maxClaims = Number(packet.max_claims);
    const totalAmount = Number(packet.total_amount);
    const seed = workerServerSeed();
    for (const allocation of allocations.rows) {
      if (claimedCount >= maxClaims || claimedAmount >= totalAmount) break;
      const claimSequence = claimedCount + 1;
      const remainingClaims = maxClaims - claimedCount;
      const remainingAmount = totalAmount - claimedAmount;
      const value = remainingClaims === 1 ? remainingAmount : demoPacketValue(seed, row.id, allocation.user_id, claimSequence, 1, remainingAmount - (remainingClaims - 1));
      const inserted = await client.query<{ created_at: string | Date }>(`INSERT INTO claim_records (packet_id, round_id, user_id, claim_sequence, demo_value)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (round_id, user_id, claim_sequence) DO NOTHING RETURNING created_at`, [packet.id, row.id, allocation.user_id, claimSequence, value]);
      if (!inserted.rows[0]) continue;
      claimedAmount += value;
      claimedCount += 1;
      await client.query("UPDATE packet_allocations SET claim_status = 'AUTO_CLAIMED', claimed_at = $3 WHERE id = $1 AND user_id = $2", [allocation.id, allocation.user_id, inserted.rows[0].created_at]);
      await client.query("UPDATE round_participants SET status = 'AUTO_CLAIMED' WHERE round_id = $1 AND user_id = $2 AND role = 'PLAYER'", [row.id, allocation.user_id]);
    }
    await client.query("UPDATE packet_records SET claimed_amount = $2, claimed_count = $3, revealed_at = now() WHERE id = $1", [packet.id, claimedAmount, claimedCount]);
    const endsAt = nextStateEnd("EVALUATING");
    const updated = await client.query<{ state_version: number }>(`UPDATE rounds SET state = 'EVALUATING', state_started_at = now(), state_ends_at = $2,
      state_version = state_version + 1 WHERE id = $1 AND state = 'CLAIMING' AND state_version = $3 RETURNING state_version`, [row.id, endsAt, row.state_version]);
    if (!updated.rows[0]) return false;
    const payload = { automated: true, reason: "packet claim deadline elapsed", packetId: packet.id, claimedCount, maxClaims, seedHash: hashSeed(seed) };
    await insertStateEvent(client, row.id, "CLAIMING", "EVALUATING", Number(updated.rows[0].state_version), workerId, payload);
    await insertInternalChatMessage(client, row.id, "⌛ 红包领取时间结束，系统已为未领取的本局参与者自动开包，正在算牌。", { templateKey: "game.packet.expired", ...payload });
    return true;
  });
}

function settlementLines(result: ReturnType<typeof settlePlayer>): SettlementLine[] {
  const stake = result.stake;
  const grossReward = result.grossReward;
  const fee = result.fee;
  const lines = result.outcome === "WIN"
    ? [
        { account: "USER_LOCKED" as const, direction: "DEBIT" as const, amount: stake, reason: "round stake" },
        { account: "BANKER_POOL" as const, direction: "DEBIT" as const, amount: grossReward, reason: "player reward" },
        { account: "USER_AVAILABLE" as const, direction: "CREDIT" as const, amount: stake + grossReward - fee, reason: "stake and net reward" },
        { account: "PLATFORM_FEE" as const, direction: "CREDIT" as const, amount: fee, reason: "settlement fee" }
      ]
    : result.outcome === "LOSE"
      ? [
          { account: "USER_LOCKED" as const, direction: "DEBIT" as const, amount: stake, reason: "round stake" },
          { account: "BANKER_POOL" as const, direction: "CREDIT" as const, amount: stake - fee, reason: "banker credit" },
          { account: "PLATFORM_FEE" as const, direction: "CREDIT" as const, amount: fee, reason: "settlement fee" }
        ]
      : [
          { account: "USER_LOCKED" as const, direction: "DEBIT" as const, amount: stake, reason: "round stake" },
          { account: "USER_AVAILABLE" as const, direction: "CREDIT" as const, amount: stake, reason: "stake return" }
        ];
  return lines.filter((line) => line.amount > 0);
}

async function postSettlement(client: QueryExecutor, roundId: string, userId: string, stake: number, packetValue: number, bankerHand: ReturnType<typeof classifyPacket>["hand"], bankerPool: number): Promise<{ result: ReturnType<typeof settlePlayer>; posted: boolean }> {
  const hand = classifyPacket(packetValue.toFixed(2)).hand;
  const result = settlePlayer({ stake, player: hand, banker: bankerHand, bankerPool });
  const existing = await client.query<{ id: string; status: string }>("SELECT id, status FROM settlements WHERE round_id = $1 AND user_id = $2 AND settlement_type = 'ROUND_SETTLEMENT' FOR UPDATE", [roundId, userId]);
  if (existing.rows[0]?.status === "POSTED") return { result, posted: false };
  const settlement = existing.rows[0] ?? (await client.query<{ id: string }>(`INSERT INTO settlements (round_id, user_id, settlement_type, status)
    VALUES ($1, $2, 'ROUND_SETTLEMENT', 'PENDING') RETURNING id`, [roundId, userId])).rows[0];
  if (!settlement) throw new Error("Unable to create settlement record");
  const idempotencyKey = `round-settlement:${roundId}:${userId}`;
  const journal = await client.query<{ id: string }>(`INSERT INTO ledger_journals (reference_type, reference_id, idempotency_key, reason, created_by)
    VALUES ('ROUND_SETTLEMENT', $1, $2, $3, 'worker') ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`, [roundId, idempotencyKey, `Round settlement · ${result.outcome} · internal Demo credit`]);
  if (!journal.rows[0]) throw new Error(`Settlement journal already exists for ${userId}`);
  for (const line of settlementLines(result)) {
    const account = await client.query<{ id: string }>(`SELECT id FROM wallet_accounts WHERE account_type = $1
      AND ((user_id = $2::uuid) OR (user_id IS NULL AND $2::uuid IS NULL)) LIMIT 1`, [line.account, line.account === "USER_LOCKED" || line.account === "USER_AVAILABLE" ? userId : null]);
    const accountId = account.rows[0]?.id;
    if (!accountId) throw new Error(`Missing wallet account ${line.account}`);
    await client.query("INSERT INTO ledger_lines (journal_id, account_id, direction, amount) VALUES ($1, $2, $3, $4)", [journal.rows[0].id, accountId, line.direction, line.amount]);
    const delta = line.direction === "DEBIT" ? -line.amount : line.amount;
    const updated = await client.query("UPDATE wallet_accounts SET balance = balance + $2 WHERE id = $1 AND balance + $2 >= 0 RETURNING id", [accountId, delta]);
    if (!updated.rows[0]) throw new Error(`Ledger balance would become negative for ${line.account}`);
    await client.query("INSERT INTO settlement_lines (settlement_id, account_type, direction, amount, reason) VALUES ($1, $2, $3, $4, $5)", [settlement.id, line.account, line.direction, line.amount, line.reason]);
  }
  await client.query(`INSERT INTO hands (round_id, user_id, points, hand_type, cards)
    VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (round_id, user_id) DO UPDATE SET points = EXCLUDED.points, hand_type = EXCLUDED.hand_type, cards = EXCLUDED.cards`, [roundId, userId, hand.points, hand.type, JSON.stringify(classifyPacket(packetValue.toFixed(2)).digits.slice(-3))]);
  await client.query("UPDATE settlements SET status = 'POSTED' WHERE id = $1", [settlement.id]);
  return { result, posted: true };
}

async function settleExpiredRound(database: Project12Database, row: DueRound, workerId: string): Promise<boolean> {
  return database.transaction(async (client) => {
    const lock = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired", [row.id]);
    if (!lock.rows[0]?.acquired) return false;
    const currentRows = await client.query<DueRound>("SELECT id, state, state_version, state_ends_at, banker_user_id FROM rounds WHERE id = $1 FOR UPDATE", [row.id]);
    const current = currentRows.rows[0];
    if (!current || current.state !== "EVALUATING" || Number(current.state_version) !== Number(row.state_version) || !current.state_ends_at || new Date(current.state_ends_at).getTime() > Date.now()) return false;
    if (!current.banker_user_id) return false;
    const poolRows = await client.query<{ balance: string | number }>("SELECT balance FROM wallet_accounts WHERE user_id IS NULL AND account_type = 'BANKER_POOL' FOR UPDATE", []);
    if (!poolRows.rows[0]) throw new Error("Missing banker pool account");
    let bankerPool = Number(poolRows.rows[0].balance);
    const bankerRound = demoRoundHand(workerServerSeed(), row.id);
    const bankerHand = { ...bankerRound.hand, amount: Number(bankerRound.amount) };
    await client.query(`INSERT INTO hands (round_id, user_id, points, hand_type, cards)
      VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (round_id, user_id) DO UPDATE SET points = EXCLUDED.points, hand_type = EXCLUDED.hand_type, cards = EXCLUDED.cards`, [row.id, current.banker_user_id, bankerHand.points, bankerHand.type, JSON.stringify(bankerRound.digits)]);
    const players = await client.query<{ user_id: string; display_name: string; bet_amount: string | number; packet_value: string | number }>(`SELECT rp.user_id, COALESCE(ti.username, u.display_name, rp.user_id::text) AS display_name,
      COALESCE(rp.bet_amount, 0) AS bet_amount, COALESCE(claim.demo_value, 0) AS packet_value
      FROM round_participants rp JOIN users u ON u.id = rp.user_id LEFT JOIN telegram_identities ti ON ti.user_id = rp.user_id
      LEFT JOIN LATERAL (SELECT demo_value FROM claim_records cr WHERE cr.round_id = rp.round_id AND cr.user_id = rp.user_id ORDER BY cr.claim_sequence DESC LIMIT 1) claim ON true
      WHERE rp.round_id = $1 AND rp.role = 'PLAYER' AND rp.status IN ('ELIGIBLE', 'CLAIMED', 'AUTO_CLAIMED') ORDER BY rp.joined_at, rp.id`, [row.id]);
    if (players.rows.length === 0) return false;
    const results: string[] = [];
    const settling = await client.query<{ state_version: number }>(`UPDATE rounds SET state = 'SETTLING', state_started_at = now(), state_ends_at = NULL,
      state_version = state_version + 1 WHERE id = $1 AND state = 'EVALUATING' AND state_version = $2 RETURNING state_version`, [row.id, row.state_version]);
    if (!settling.rows[0]) return false;
    await insertStateEvent(client, row.id, "EVALUATING", "SETTLING", Number(settling.rows[0].state_version), workerId, { automated: true, reason: "evaluation deadline elapsed" });
    for (const player of players.rows) {
      const packetValue = Number(player.packet_value);
      const settlement = await postSettlement(client, row.id, player.user_id, Number(player.bet_amount), packetValue, bankerHand, bankerPool);
      if (settlement.posted) bankerPool = settlement.result.bankerPoolAfter;
      const hand = classifyPacket(packetValue.toFixed(2)).hand;
      results.push(`${player.display_name} · ${hand.type} ${hand.points}点 · ${settlement.result.outcome} · ${Number(player.bet_amount)} PT`);
    }
    await client.query(`INSERT INTO banker_pools (round_id, amount) VALUES ($1, $2)
      ON CONFLICT (round_id) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()`, [row.id, bankerPool]);
    const completed = await client.query<{ state_version: number }>(`UPDATE rounds SET state = 'ROUND_COMPLETE', state_started_at = now(), state_ends_at = NULL,
      server_seed = $2, seed_revealed_at = now(), state_version = state_version + 1 WHERE id = $1 AND state = 'SETTLING' RETURNING state_version`, [row.id, workerServerSeed()]);
    if (!completed.rows[0]) return false;
    const payload = { automated: true, reason: "settlement posted", bankerUserId: current.banker_user_id, bankerHand, bankerPoolAfter: bankerPool, seedHash: hashSeed(workerServerSeed()), results };
    await insertStateEvent(client, row.id, "SETTLING", "ROUND_COMPLETE", Number(completed.rows[0].state_version), workerId, payload);
    await insertInternalChatMessage(client, row.id, `📊 本局成绩已公布\n庄家：${current.banker_user_id} · ${bankerHand.type}${bankerHand.points} · 牌面 ${bankerRound.amount}\n${results.join("\\n")}`, { templateKey: "game.results.published", ...payload, bankerAmount: bankerRound.amount, bankerCards: bankerRound.digits });
    await insertInternalChatMessage(client, row.id, "平台通知：本局已完成，内部 Demo 账本结算已写入。", { templateKey: "game.settlement.complete", ...payload });
    return true;
  });
}

const timedCandidates: Partial<Record<RoundState, RoundState>> = {
  LOBBY: "BANKER_BIDDING",
  BANKER_BIDDING: "BETTING",
  BETTING: "WAITING_BANKER_CONFIRM",
  PACKET_SENT: "CLAIMING",
  CLAIMING: "EVALUATING",
  EVALUATING: "SETTLING",
  SETTLING: "ROUND_COMPLETE"
};

const nextStateDurationSeconds: Partial<Record<RoundState, number>> = {
  BANKER_BIDDING: 30,
  BETTING: 30,
  WAITING_BANKER_CONFIRM: 60,
  CLAIMING: 45,
  EVALUATING: 10,
  SETTLING: 15
};

export function nextTimedState(state: RoundState): RoundState | undefined { return timedCandidates[state]; }

function nextEndsAt(next: RoundState): Date | null {
  const seconds = nextStateDurationSeconds[next];
  return seconds === undefined ? null : new Date(Date.now() + seconds * 1000);
}

async function canCompleteSettlement(client: QueryExecutor, roundId: string): Promise<boolean> {
  const rows = await client.query<{ total: string | number; posted: string | number }>(`SELECT COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'POSTED') AS posted FROM settlements WHERE round_id = $1`, [roundId]);
  const row = rows.rows[0];
  return Boolean(row && Number(row.total) > 0 && Number(row.total) === Number(row.posted));
}

async function advanceRound(database: Project12Database, row: DueRound, workerId: string): Promise<boolean> {
  const next = nextTimedState(row.state);
  if (!next) return false;
  return database.transaction(async (client) => {
    const lock = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired", [row.id]);
    if (!lock.rows[0]?.acquired) return false;
    const currentRows = await client.query<DueRound>("SELECT id, state, state_version, state_ends_at FROM rounds WHERE id = $1 FOR UPDATE", [row.id]);
    const current = currentRows.rows[0];
    if (!current || current.state !== row.state || Number(current.state_version) !== Number(row.state_version) || !current.state_ends_at || new Date(current.state_ends_at).getTime() > Date.now()) return false;
    if (current.state === "SETTLING" && !(await canCompleteSettlement(client, current.id))) return false;
    let bankerUserId: string | null = null;
    let bankerAmount: number | null = null;
    if (current.state === "BANKER_BIDDING") {
      const bids = await client.query<{ user_id: string; amount: string | number }>(`SELECT user_id, amount FROM banker_bids
        WHERE round_id = $1 ORDER BY amount DESC, created_at ASC, id ASC LIMIT 1`, [current.id]);
      const winner = bids.rows[0];
      if (!winner) return false;
      bankerUserId = winner.user_id;
      bankerAmount = Number(winner.amount);
    }
    const endsAt = nextEndsAt(next);
    const payload = { actor: `worker:${workerId}`, reason: "state deadline elapsed", previousVersion: Number(current.state_version), ...(bankerUserId ? { bankerUserId, bankerAmount } : {}) };
    const updated = await client.query<{ id: string; state_version: number }>(`UPDATE rounds SET state = $2, state_started_at = now(), state_ends_at = $3,
      banker_user_id = COALESCE($6::uuid, banker_user_id), state_version = state_version + 1
      WHERE id = $1 AND state = $4 AND state_version = $5 AND state_ends_at <= now() RETURNING id, state_version`, [current.id, next, endsAt, current.state, current.state_version, bankerUserId]);
    if (!updated.rows[0]) return false;
    await client.query("INSERT INTO round_events (round_id, from_state, to_state, payload, actor) VALUES ($1, $2, $3, $4::jsonb, $5)", [current.id, current.state, next, JSON.stringify(payload), `worker:${workerId}`]);
    const roomNotice = current.state === "BANKER_BIDDING"
      ? {
          templateKey: "game.betting.opened",
          body: "平台通知：抢庄结束，最高庄金玩家已成为庄家，下注阶段开始。",
          payload: { roundId: current.id, state: next, bankerUserId, bankerAmount, automated: true }
        }
      : current.state === "BETTING"
        ? {
            templateKey: "game.betting.closed",
            body: "✅ 平台通知：下注结束，请庄家在聊天室发送任意文字确认发包；发送 /重推取消本局。旁观者不会收到领取入口。",
            payload: { roundId: current.id, state: next, automated: true }
          }
        : null;
    if (roomNotice) {
      const message = await client.query<{ id: string; message_seq: number; created_at: string | Date }>(`INSERT INTO room_messages
        (room_id, round_id, message_type, visibility, template_key, body, payload)
        SELECT room_id, id, 'ROUND', 'PUBLIC_ROOM', $2, $3, $4::jsonb
        FROM rounds WHERE id = $1 RETURNING id::text, message_seq, created_at`, [current.id, roomNotice.templateKey, roomNotice.body, JSON.stringify(roomNotice.payload)]);
      const messageId = message.rows[0]?.id;
      if (messageId) await client.query("INSERT INTO outbox_events (event_type, payload) VALUES ($1, $2::jsonb)", ["INTERNAL_CHAT_MESSAGE", JSON.stringify({ messageId, messageSeq: Number(message.rows[0].message_seq), roundId: current.id, type: "ROUND", body: roomNotice.body, payload: roomNotice.payload, visibility: "PUBLIC_ROOM", createdAt: new Date(message.rows[0].created_at).toISOString() })]);
    }
    await client.query("INSERT INTO outbox_events (event_type, payload) VALUES ($1, $2::jsonb)", ["ROUND_STATE_CHANGED", JSON.stringify({ roundId: current.id, from: current.state, to: next, stateVersion: updated.rows[0].state_version, ...payload })]);
    return true;
  });
}

export async function advanceExpiredRounds(database: Project12Database, workerId: string, limit = 20): Promise<number> {
  if (!database.configured) return 0;
  const rows = await database.query<DueRound>(`SELECT id, state, state_version, state_ends_at FROM rounds
    WHERE state_ends_at IS NOT NULL AND state_ends_at <= now()
      AND state IN ('LOBBY', 'BANKER_BIDDING', 'BETTING', 'PACKET_SENT', 'CLAIMING', 'EVALUATING', 'SETTLING')
    ORDER BY state_ends_at ASC LIMIT $1`, [limit]);
  let advanced = 0;
  for (const row of rows) {
    if (row.state === "CLAIMING") {
      if (await autoClaimExpiredRound(database, row, workerId)) advanced += 1;
      continue;
    }
    if (row.state === "EVALUATING") {
      if (await settleExpiredRound(database, row, workerId)) advanced += 1;
      continue;
    }
    if (await advanceRound(database, row, workerId)) advanced += 1;
  }
  return advanced;
}
