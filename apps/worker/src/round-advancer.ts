import type { QueryExecutor, Project12Database } from "../../../packages/database/src/index.js";
import type { RoundState } from "../../../packages/contracts/src/index.js";

type DueRound = { id: string; state: RoundState; state_version: number; state_ends_at: string | Date | null };

const timedCandidates: Partial<Record<RoundState, RoundState>> = {
  LOBBY: "BANKER_BIDDING",
  BANKER_BIDDING: "BETTING",
  PACKET_SENT: "CLAIMING",
  CLAIMING: "EVALUATING",
  EVALUATING: "SETTLING",
  SETTLING: "ROUND_COMPLETE"
};

const nextStateDurationSeconds: Partial<Record<RoundState, number>> = {
  BANKER_BIDDING: 30,
  BETTING: 30,
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
            body: "✅ 平台通知：下注结束，请庄家发送「确认发红包」开始发红包。旁观者不会收到领取入口。",
            payload: { roundId: current.id, state: next, automated: true }
          }
        : null;
    if (roomNotice) {
      const message = await client.query<{ id: string }>(`INSERT INTO room_messages
        (room_id, round_id, message_type, visibility, template_key, body, payload)
        SELECT room_id, id, 'ROUND', 'PUBLIC_ROOM', $2, $3, $4::jsonb
        FROM rounds WHERE id = $1 RETURNING id::text`, [current.id, roomNotice.templateKey, roomNotice.body, JSON.stringify(roomNotice.payload)]);
      const messageId = message.rows[0]?.id;
      if (messageId) await client.query("INSERT INTO outbox_events (event_type, payload) VALUES ($1, $2::jsonb)", ["INTERNAL_CHAT_MESSAGE", JSON.stringify({ messageId, roundId: current.id, type: "ROUND", body: roomNotice.body, payload: roomNotice.payload, visibility: "PUBLIC_ROOM" })]);
    }
    await client.query("INSERT INTO outbox_events (event_type, payload) VALUES ($1, $2::jsonb)", ["ROUND_STATE_CHANGED", JSON.stringify({ roundId: current.id, from: current.state, to: next, stateVersion: updated.rows[0].state_version, ...payload })]);
    return true;
  });
}

export async function advanceExpiredRounds(database: Project12Database, workerId: string, limit = 20): Promise<number> {
  if (!database.configured) return 0;
  const rows = await database.query<DueRound>(`SELECT id, state, state_version, state_ends_at FROM rounds
    WHERE state_ends_at IS NOT NULL AND state_ends_at <= now()
      AND state IN ('LOBBY', 'BANKER_BIDDING', 'PACKET_SENT', 'CLAIMING', 'EVALUATING', 'SETTLING')
    ORDER BY state_ends_at ASC LIMIT $1`, [limit]);
  let advanced = 0;
  for (const row of rows) if (await advanceRound(database, row, workerId)) advanced += 1;
  return advanced;
}
