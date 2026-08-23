import { createHash } from "node:crypto";
import { Project12Database, type QueryExecutor } from "../../../packages/database/src/index.js";
import { demoPacketValue } from "../../../packages/game-engine/src/index.js";
import type { Journal } from "../../../packages/ledger/src/index.js";
import type { RoundState } from "../../../packages/contracts/src/index.js";
import { PacketProviderError, type PacketClaim, type PacketRecord, type PacketStore } from "./providers/packet-provider.js";
import { telegramLaunchTokenHash } from "../../../packages/telegram/src/index.js";
import { decryptVerificationValue, encryptVerificationValue, maskTngAccount } from "./verification-security.js";

const defaultRoundId = "00000000-0000-0000-0001-000000000004";

type AuditInput = { actor: string; action: string; referenceType: string; referenceId: string; before?: unknown; after?: unknown };
type RoundEventInput = { roundId: string; from?: RoundState; to: RoundState; stateEndsAt?: Date | null; payload: Record<string, unknown>; actor: string };
type WorkerHeartbeat = { workerId: string; status: string; heartbeatAt: string };
export type RoundRuntimeSnapshot = { roundId: string; state: RoundState; stateEndsAt?: string; bankerUserId?: string; bankerPool: number };

type PacketRow = {
  id: string;
  round_id?: string;
  provider: string;
  total_amount: string | number;
  max_claims: string | number;
  claimed_amount: string | number;
  claimed_count: string | number;
  created_at: string | Date;
  expires_at: string | Date;
  cancelled_at?: string | Date | null;
};

export type UserRuntimeSnapshot = {
  displayName: string;
  available: number;
  locked: number;
  bankerPool: number;
  onboarding: { deviceBound: boolean; referrerBound: boolean; pinSet: boolean };
  ledger: Array<{ id: string; reason: string; change: number; balanceAfter: number; createdAt: string }>;
};
export type VerificationStatus = "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_MORE_INFO" | "SUSPENDED";
export type VerificationSnapshot = { status: VerificationStatus; submittedAt?: string; tngAccountLast4?: string; rejectionReason?: string };
export type VerificationCaseSnapshot = VerificationSnapshot & { telegramUserId: string; legalName?: string; tngAccountMasked?: string };
export type RoomMessage = {
  id: string;
  messageSeq?: number;
  type: string;
  body: string;
  actor?: string;
  createdAt: string;
  payload: Record<string, unknown>;
  templateKey?: string;
  visibility?: "PUBLIC_ROOM" | "PARTICIPANTS_ONLY" | "TARGET_USER" | "ADMIN_ONLY";
  targetUserId?: string;
};

function iso(value: string | Date): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }

function packetRecord(row: PacketRow, roundId: string): PacketRecord {
  return {
    id: row.id,
    provider: row.provider,
    roundId,
    createdAt: iso(row.created_at),
    totalAmount: Number(row.total_amount),
    maxClaims: Number(row.max_claims),
    claimedAmount: Number(row.claimed_amount),
    claimedCount: Number(row.claimed_count),
    expiresAt: iso(row.expires_at),
    ...(row.cancelled_at ? { cancelledAt: iso(row.cancelled_at) } : {})
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ApiPersistence implements PacketStore {
  private readonly database: Project12Database;
  private readonly strict: boolean;
  private currentRoundId = process.env.DEMO_ROUND_DB_ID ?? defaultRoundId;

  constructor(database = new Project12Database()) {
    this.database = database;
    this.strict = (process.env.NODE_ENV === "production" ? "production" : process.env.APP_MODE ?? (process.env.NODE_ENV === "test" ? "demo" : "production")) !== "demo";
  }

  get configured(): boolean { return this.database.configured; }

  get roundDatabaseId(): string { return this.currentRoundId; }

  private databaseRoundId(roundId?: string): string {
    return roundId && uuidPattern.test(roundId) ? roundId : this.roundDatabaseId;
  }

  async health(): Promise<"disabled" | "healthy" | "unavailable"> {
    return this.database.health();
  }

  async resolveDatabaseUserId(telegramUserId: string): Promise<string | undefined> {
    if (!this.configured) return undefined;
    const rows = await this.database.query<{ user_id: string }>("SELECT user_id::text FROM telegram_identities WHERE telegram_user_id = $1", [telegramUserId]);
    return rows[0]?.user_id;
  }

  async ensureRoomMember(telegramUserId: string, roundId?: string): Promise<void> {
    await this.run(() => this.database.query(`INSERT INTO room_members (room_id, user_id, left_at)
      SELECT r.room_id, ti.user_id, NULL
      FROM rounds r
      JOIN telegram_identities ti ON ti.telegram_user_id = $1
      WHERE r.id = $2
      ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL`, [telegramUserId, this.databaseRoundId(roundId)]).then(() => undefined));
  }

  async loadVerification(telegramUserId: string): Promise<VerificationSnapshot | undefined> {
    if (!this.configured) return undefined;
    const rows = await this.database.query<{ status: VerificationStatus; submitted_at: string | Date; tng_account_last4: string; rejection_reason?: string | null }>(`SELECT iv.status, iv.submitted_at, iv.tng_account_last4, iv.rejection_reason
      FROM identity_verifications iv JOIN telegram_identities ti ON ti.user_id = iv.user_id WHERE ti.telegram_user_id = $1`, [telegramUserId]);
    const row = rows[0];
    return row ? { status: row.status, submittedAt: iso(row.submitted_at), tngAccountLast4: maskTngAccount(row.tng_account_last4), ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {}) } : { status: "NOT_SUBMITTED" };
  }

  async persistVerification(telegramUserId: string, legalName: string, tngAccountNo: string): Promise<VerificationSnapshot> {
    if (!this.configured) throw new Error("DATABASE_REQUIRED: Verification requires persistent storage");
    const rows = await this.database.transaction(async (client) => {
      const existing = await client.query<{ status: VerificationStatus }>("SELECT iv.status FROM identity_verifications iv JOIN telegram_identities ti ON ti.user_id = iv.user_id WHERE ti.telegram_user_id = $1 FOR UPDATE", [telegramUserId]);
      if (["APPROVED", "SUSPENDED"].includes(existing.rows[0]?.status ?? "")) throw new Error(existing.rows[0]?.status === "SUSPENDED" ? "VERIFICATION_ACCOUNT_SUSPENDED" : "VERIFICATION_ALREADY_APPROVED");
      return client.query<{ status: VerificationStatus; submitted_at: string | Date; tng_account_last4: string }>(`INSERT INTO identity_verifications (user_id, legal_name_ciphertext, tng_account_ciphertext, tng_account_last4, status, submitted_at, reviewed_by, reviewed_at, rejection_reason)
        SELECT ti.user_id, $2, $3, $4, 'PENDING', now(), NULL, NULL, NULL FROM telegram_identities ti WHERE ti.telegram_user_id = $1
        ON CONFLICT (user_id) DO UPDATE SET legal_name_ciphertext = EXCLUDED.legal_name_ciphertext, tng_account_ciphertext = EXCLUDED.tng_account_ciphertext,
          tng_account_last4 = EXCLUDED.tng_account_last4, status = 'PENDING', submitted_at = now(), reviewed_by = NULL, reviewed_at = NULL, rejection_reason = NULL
        RETURNING status, submitted_at, tng_account_last4`, [telegramUserId, encryptVerificationValue(legalName), encryptVerificationValue(tngAccountNo), tngAccountNo.slice(-4)]);
    });
    const row = rows.rows[0];
    if (!row) throw new Error("Unable to persist verification");
    return { status: row.status, submittedAt: iso(row.submitted_at), tngAccountLast4: maskTngAccount(row.tng_account_last4) };
  }

  async reviewVerification(telegramUserId: string, status: "APPROVED" | "REJECTED", reviewedBy: string, rejectionReason?: string): Promise<VerificationSnapshot | undefined> {
    if (!this.configured) return undefined;
    const rows = await this.database.query<{ status: VerificationStatus; submitted_at: string | Date; tng_account_last4: string; rejection_reason?: string | null }>(`UPDATE identity_verifications iv SET status = $2, reviewed_by = $3, reviewed_at = now(), rejection_reason = $4
      FROM telegram_identities ti WHERE iv.user_id = ti.user_id AND ti.telegram_user_id = $1
      RETURNING iv.status, iv.submitted_at, iv.tng_account_last4, iv.rejection_reason`, [telegramUserId, status, reviewedBy, rejectionReason ?? null]);
    const row = rows[0];
    return row ? { status: row.status, submittedAt: iso(row.submitted_at), tngAccountLast4: maskTngAccount(row.tng_account_last4), ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {}) } : undefined;
  }

  async listVerificationCases(status?: VerificationStatus): Promise<VerificationCaseSnapshot[]> {
    if (!this.configured) return [];
    const rows = await this.database.query<{ telegram_user_id: string; legal_name_ciphertext: string; tng_account_last4: string; status: VerificationStatus; submitted_at: string | Date; rejection_reason?: string | null }>(`SELECT ti.telegram_user_id, iv.legal_name_ciphertext, iv.tng_account_last4, iv.status, iv.submitted_at, iv.rejection_reason
      FROM identity_verifications iv JOIN telegram_identities ti ON ti.user_id = iv.user_id
      WHERE ($1::text IS NULL OR iv.status = $1) ORDER BY iv.submitted_at DESC LIMIT 200`, [status ?? null]);
    return rows.map((row) => ({
      telegramUserId: row.telegram_user_id,
      legalName: decryptVerificationValue(row.legal_name_ciphertext),
      tngAccountMasked: maskTngAccount(row.tng_account_last4),
      tngAccountLast4: maskTngAccount(row.tng_account_last4),
      status: row.status,
      submittedAt: iso(row.submitted_at),
      ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {})
    }));
  }

  async reviewVerificationCase(telegramUserId: string, status: Exclude<VerificationStatus, "NOT_SUBMITTED">, reviewedBy: string, reason?: string): Promise<VerificationSnapshot | undefined> {
    if (!this.configured) return undefined;
    const result = await this.database.transaction(async (client) => {
      const before = await client.query<{ id: string; user_id: string; status: VerificationStatus }>(`SELECT iv.id, iv.user_id, iv.status FROM identity_verifications iv JOIN telegram_identities ti ON ti.user_id = iv.user_id WHERE ti.telegram_user_id = $1 FOR UPDATE`, [telegramUserId]);
      const current = before.rows[0];
      if (!current) return undefined;
      const updated = await client.query<{ status: VerificationStatus; submitted_at: string | Date; tng_account_last4: string; rejection_reason?: string | null }>(`UPDATE identity_verifications iv SET status = $2, reviewed_by = $3, reviewed_at = now(), rejection_reason = $4
        FROM telegram_identities ti WHERE iv.user_id = ti.user_id AND ti.telegram_user_id = $1
        RETURNING iv.status, iv.submitted_at, iv.tng_account_last4, iv.rejection_reason`, [telegramUserId, status, reviewedBy, reason ?? null]);
      await client.query(`INSERT INTO verification_audit_logs (verification_id, user_id, actor_user_id, action, before_status, after_status, note)
        VALUES ($1, $2, NULL, 'REVIEW', $3, $4, $5)`, [current.id, current.user_id, current.status, status, reason ?? null]);
      const row = updated.rows[0];
      return row ? { status: row.status, submittedAt: iso(row.submitted_at), tngAccountLast4: maskTngAccount(row.tng_account_last4), ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {}) } : undefined;
    });
    return result;
  }

  async persistRoomMessage(input: { roundId?: string; userId?: string; type: string; body: string; payload?: Record<string, unknown>; templateKey?: string; visibility?: RoomMessage["visibility"]; targetUserId?: string }): Promise<{ id: string; messageSeq: number; createdAt: string } | undefined> {
    const rows = await this.run(() => this.database.query<{ id: string; message_seq: number; created_at: string | Date }>(`INSERT INTO room_messages (room_id, round_id, user_id, target_user_id, message_type, visibility, template_key, body, payload)
      SELECT r.room_id, r.id, sender_ti.user_id, target_ti.user_id, $2, $6, $8, $3, $4::jsonb
      FROM rounds r
      LEFT JOIN telegram_identities sender_ti ON sender_ti.telegram_user_id = $5
      LEFT JOIN telegram_identities target_ti ON target_ti.telegram_user_id = $7
      WHERE r.id = $1 RETURNING id::text, message_seq, created_at`, [input.roundId ?? this.roundDatabaseId, input.type, input.body, JSON.stringify(input.payload ?? {}), input.userId ?? null, input.visibility ?? "PUBLIC_ROOM", input.targetUserId ?? null, input.templateKey ?? null]));
    const row = rows?.[0];
    return row ? { id: row.id, messageSeq: Number(row.message_seq), createdAt: iso(row.created_at) } : undefined;
  }

  async loadRoomMessages(roundId?: string, viewerTelegramUserId?: string, before?: string, limit = 50, after?: string): Promise<RoomMessage[]> {
    if (!this.configured) return [];
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 50);
    const beforeIsSeq = before && /^\d+$/.test(before) ? before : null;
    const afterIsSeq = after && /^\d+$/.test(after) ? after : null;
    const beforeTimestamp = before && !beforeIsSeq ? before : null;
    const rows = await this.database.query<{ id: string; message_seq: number; message_type: string; template_key?: string | null; visibility?: RoomMessage["visibility"] | null; target_user_id?: string | null; body: string; display_name?: string | null; created_at: string | Date; payload: Record<string, unknown> }>(`SELECT rm.id::text AS id, rm.message_seq, rm.message_type, rm.template_key, COALESCE(rm.visibility, 'PUBLIC_ROOM') AS visibility,
        rm.target_user_id::text AS target_user_id, rm.body, u.display_name, rm.created_at, rm.payload
      FROM room_messages rm
      LEFT JOIN users u ON u.id = rm.user_id
      LEFT JOIN telegram_identities target_ti ON target_ti.user_id = rm.target_user_id
      WHERE ${roundId ? "rm.round_id = $1" : "rm.room_id = (SELECT room_id FROM rounds WHERE id = $1)"}
        AND (($3::bigint IS NULL AND $4::timestamptz IS NULL) OR ($3::bigint IS NOT NULL AND rm.message_seq < $3::bigint) OR ($4::timestamptz IS NOT NULL AND rm.created_at < $4::timestamptz))
        AND ($5::bigint IS NULL OR rm.message_seq > $5::bigint)
        AND (
          COALESCE(rm.visibility, 'PUBLIC_ROOM') = 'PUBLIC_ROOM'
          OR (rm.visibility = 'TARGET_USER' AND target_ti.telegram_user_id = $2)
          OR (rm.visibility = 'PARTICIPANTS_ONLY' AND EXISTS (
            SELECT 1 FROM round_participants rp
            JOIN telegram_identities participant_ti ON participant_ti.user_id = rp.user_id
            WHERE rp.round_id = rm.round_id AND rp.role = 'PLAYER'
              AND rp.status IN ('ELIGIBLE', 'CLAIMED', 'AUTO_CLAIMED')
              AND participant_ti.telegram_user_id = $2
          ))
        )
      ORDER BY rm.message_seq DESC LIMIT ${safeLimit}`, [roundId ?? this.roundDatabaseId, viewerTelegramUserId ?? null, beforeIsSeq, beforeTimestamp, afterIsSeq]);
    return rows.reverse().map((row) => ({ id: row.id, messageSeq: Number(row.message_seq), type: row.message_type, body: row.body, ...(row.display_name ? { actor: row.display_name } : {}), createdAt: iso(row.created_at), payload: row.payload ?? {}, ...(row.template_key ? { templateKey: row.template_key } : {}), visibility: row.visibility ?? "PUBLIC_ROOM", ...(row.target_user_id ? { targetUserId: row.target_user_id } : {}) }));
  }

  async persistRoomRead(roundId: string | undefined, telegramUserId: string, lastMessageId?: string, lastMessageSeq?: number): Promise<void> {
    const messageId = lastMessageId && uuidPattern.test(lastMessageId) ? lastMessageId : null;
    await this.run(() => this.database.query(`INSERT INTO chat_message_reads (room_id, user_id, last_read_message_id, last_read_message_seq, updated_at)
      SELECT r.room_id, ti.user_id, $3::uuid, $4::bigint, now()
      FROM rounds r JOIN telegram_identities ti ON ti.telegram_user_id = $2
      WHERE r.id = $1
      ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_message_id = COALESCE(EXCLUDED.last_read_message_id, chat_message_reads.last_read_message_id), last_read_message_seq = COALESCE(EXCLUDED.last_read_message_seq, chat_message_reads.last_read_message_seq), updated_at = now()`, [this.databaseRoundId(roundId), telegramUserId, messageId, Number.isFinite(lastMessageSeq) ? lastMessageSeq : null]).then(() => undefined));
  }

  async loadUserRuntime(telegramUserId: string): Promise<UserRuntimeSnapshot | undefined> {
    if (!this.configured) return undefined;
    const rows = await this.database.query<{ display_name: string; available: string | number; locked: string | number; banker_pool: string | number; device_bound: boolean; referrer_bound: boolean; pin_set: boolean }>(`SELECT u.display_name,
      COALESCE((SELECT balance FROM wallet_accounts WHERE user_id = u.id AND account_type = 'USER_AVAILABLE'), 0) AS available,
      COALESCE((SELECT balance FROM wallet_accounts WHERE user_id = u.id AND account_type = 'USER_LOCKED'), 0) AS locked,
      COALESCE((SELECT balance FROM wallet_accounts WHERE user_id IS NULL AND account_type = 'BANKER_POOL'), 0) AS banker_pool,
      EXISTS (SELECT 1 FROM device_bindings WHERE user_id = u.id AND unbound_at IS NULL) AS device_bound,
      EXISTS (SELECT 1 FROM referral_edges WHERE referred_user_id = u.id) AS referrer_bound,
      EXISTS (SELECT 1 FROM security_pins WHERE user_id = u.id) AS pin_set
      FROM telegram_identities ti JOIN users u ON u.id = ti.user_id WHERE ti.telegram_user_id = $1`, [telegramUserId]);
    const row = rows[0];
    if (!row) return undefined;
    const ledgerRows = await this.database.query<{ id: string; reason: string; direction: "DEBIT" | "CREDIT"; amount: string | number; balance_after: string | number; created_at: string | Date }>(`SELECT lj.id::text AS id, lj.reason, ll.direction, ll.amount,
      SUM(CASE WHEN ll.direction = 'CREDIT' THEN ll.amount ELSE -ll.amount END) OVER (PARTITION BY wa.account_type ORDER BY lj.created_at, lj.id ROWS UNBOUNDED PRECEDING) AS balance_after,
      lj.created_at
      FROM ledger_journals lj JOIN ledger_lines ll ON ll.journal_id = lj.id JOIN wallet_accounts wa ON wa.id = ll.account_id
      JOIN telegram_identities ti ON ti.user_id = wa.user_id
      WHERE ti.telegram_user_id = $1 AND wa.account_type = 'USER_AVAILABLE'
      ORDER BY lj.created_at DESC, lj.id DESC LIMIT 50`, [telegramUserId]);
    return { displayName: row.display_name, available: Number(row.available), locked: Number(row.locked), bankerPool: Number(row.banker_pool), onboarding: { deviceBound: row.device_bound, referrerBound: row.referrer_bound, pinSet: row.pin_set }, ledger: ledgerRows.map((entry) => ({ id: entry.id, reason: entry.reason, change: (entry.direction === "CREDIT" ? 1 : -1) * Number(entry.amount), balanceAfter: Number(entry.balance_after), createdAt: iso(entry.created_at) })) };
  }

  async createInternalPacket(input: { roundId: string; amount: number; maxClaims?: number; serverSeedHash?: string }): Promise<PacketRecord> {
    if (!this.configured) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Persistent packet storage is not configured");
    const maxClaims = Math.max(1, Math.min(input.maxClaims ?? 8, input.amount));
    const rows = await this.database.query<PacketRow>(`INSERT INTO packet_records
      (round_id, provider, server_seed_hash, total_amount, max_claims, claimed_amount, claimed_count, expires_at)
      VALUES ($1, 'InternalPacketProvider', $2, $3, $4, 0, 0, now() + interval '45 seconds')
      ON CONFLICT (round_id) DO UPDATE SET provider = packet_records.provider
      RETURNING id, round_id, provider, total_amount, max_claims, claimed_amount, claimed_count, created_at, expires_at, cancelled_at`,
    [this.databaseRoundId(input.roundId), input.serverSeedHash ?? "unavailable", input.amount, maxClaims]);
    const row = rows[0];
    if (!row) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Unable to create internal packet");
    return packetRecord(row, input.roundId);
  }

  async getInternalPacket(roundId: string): Promise<PacketRecord | undefined> {
    if (!this.configured) return undefined;
    const rows = await this.database.query<PacketRow>(`SELECT id, round_id, provider, total_amount, max_claims, claimed_amount, claimed_count, created_at, expires_at, cancelled_at
      FROM packet_records WHERE round_id = $1 ORDER BY created_at DESC LIMIT 1`, [this.databaseRoundId(roundId)]);
    return rows[0] ? packetRecord(rows[0], roundId) : undefined;
  }

  async claimInternalPacket(input: { packetId: string; serverSeed: string; roundId: string; userId: string; claimSequence: number }): Promise<PacketClaim> {
    if (!this.configured) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Persistent packet storage is not configured");
    return this.database.transaction(async (client) => {
      const packetRows = await client.query<PacketRow>(`SELECT id, round_id, provider, total_amount, max_claims, claimed_amount, claimed_count, created_at, expires_at, cancelled_at
        FROM packet_records WHERE id = $1::uuid FOR UPDATE`, [input.packetId]);
      const row = packetRows.rows[0];
      if (!row) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Internal packet not found");
      const packet = packetRecord(row, input.roundId);
      if (packet.cancelledAt) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Internal packet has been cancelled");
      if (Date.parse(packet.expiresAt) <= Date.now()) throw new PacketProviderError("PACKET_EXHAUSTED", "Internal packet has expired");

      const identity = await client.query<{ user_id: string }>("SELECT user_id FROM telegram_identities WHERE telegram_user_id = $1", [input.userId]);
      const userId = identity.rows[0]?.user_id;
      if (!userId) throw new PacketProviderError("AUTHORIZATION_REQUIRED", "Telegram identity is not persisted");
      const allocation = await client.query<{ claim_status: "ELIGIBLE" | "CLAIMED" | "AUTO_CLAIMED" | "EXPIRED" }>("SELECT claim_status FROM packet_allocations WHERE packet_id = $1::uuid AND user_id = $2::uuid FOR UPDATE", [input.packetId, userId]);
      if (!allocation.rows[0]) throw new PacketProviderError("ROUND_PARTICIPANT_REQUIRED", "Only successful bettors can claim this internal packet");
      if (allocation.rows[0].claim_status !== "ELIGIBLE") throw new PacketProviderError("ALREADY_CLAIMED", "You have already claimed this internal packet");
      const claimRows = await client.query<{ user_id: string; demo_value: string | number; claim_sequence: string | number; created_at: string | Date }>(`SELECT ti.telegram_user_id AS user_id, cr.demo_value, cr.claim_sequence, cr.created_at
        FROM claim_records cr JOIN telegram_identities ti ON ti.user_id = cr.user_id WHERE cr.packet_id = $1::uuid ORDER BY cr.claim_sequence ASC`, [input.packetId]);
      if (claimRows.rows.some((claim) => claim.user_id === input.userId)) throw new PacketProviderError("ALREADY_CLAIMED", "You have already claimed this internal packet");
      const claimedCount = Number(row.claimed_count);
      const maxClaims = Number(row.max_claims);
      const totalAmount = Number(row.total_amount);
      const claimedAmount = Number(row.claimed_amount);
      if (claimedCount >= maxClaims || claimedAmount >= totalAmount) throw new PacketProviderError("PACKET_EXHAUSTED", "Internal packet has been fully claimed");
      const claimSequence = claimedCount + 1;
      const remainingClaims = maxClaims - claimedCount;
      const remainingAmount = totalAmount - claimedAmount;
      const value = remainingClaims === 1 ? remainingAmount : demoPacketValue(input.serverSeed, input.roundId, input.userId, claimSequence, 1, remainingAmount - (remainingClaims - 1));
      const inserted = await client.query<{ created_at: string | Date }>(`INSERT INTO claim_records (packet_id, round_id, user_id, claim_sequence, demo_value)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5) ON CONFLICT (round_id, user_id, claim_sequence) DO NOTHING RETURNING created_at`, [input.packetId, this.databaseRoundId(input.roundId), userId, claimSequence, value]);
      if (!inserted.rows[0]) throw new PacketProviderError("ALREADY_CLAIMED", "This packet claim has already been recorded");
      const claimedAt = iso(inserted.rows[0].created_at);
      const nextClaimedAmount = claimedAmount + value;
      const nextClaimedCount = claimedCount + 1;
      await client.query("UPDATE packet_records SET claimed_amount = $2, claimed_count = $3 WHERE id = $1::uuid", [input.packetId, nextClaimedAmount, nextClaimedCount]);
      await client.query("UPDATE packet_allocations SET claim_status = 'CLAIMED', claimed_at = $3 WHERE packet_id = $1::uuid AND user_id = $2::uuid", [input.packetId, userId, claimedAt]);
      return { packetId: input.packetId, userId: input.userId, value, claimedAt, claimSequence, label: "PROJECT 12 INTERNAL CREDIT · NO CASH VALUE", totalAmount, maxClaims, claimedAmount: nextClaimedAmount, claimedCount: nextClaimedCount, remainingAmount: totalAmount - nextClaimedAmount, remainingClaims: maxClaims - nextClaimedCount };
    });
  }

  async getInternalPacketClaims(packetId: string): Promise<PacketClaim[]> {
    if (!this.configured) return [];
    const packetRows = await this.database.query<PacketRow>("SELECT id, round_id, provider, total_amount, max_claims, claimed_amount, claimed_count, created_at, expires_at, cancelled_at FROM packet_records WHERE id = $1::uuid", [packetId]);
    const row = packetRows[0];
    if (!row) return [];
    const claims = await this.database.query<{ user_id: string; value: string | number; claim_sequence: string | number; created_at: string | Date }>(`SELECT ti.telegram_user_id AS user_id, cr.demo_value AS value, cr.claim_sequence, cr.created_at
      FROM claim_records cr JOIN telegram_identities ti ON ti.user_id = cr.user_id WHERE cr.packet_id = $1::uuid ORDER BY cr.claim_sequence ASC`, [packetId]);
    const packet = packetRecord(row, row.round_id ?? this.roundDatabaseId);
    let claimedAmount = 0;
    return claims.map((claim, index) => {
      const value = Number(claim.value);
      claimedAmount += value;
      return { packetId, userId: claim.user_id, value, claimedAt: iso(claim.created_at), claimSequence: Number(claim.claim_sequence), label: "PROJECT 12 INTERNAL CREDIT · NO CASH VALUE", totalAmount: packet.totalAmount, maxClaims: packet.maxClaims, claimedAmount, claimedCount: index + 1, remainingAmount: packet.totalAmount - claimedAmount, remainingClaims: packet.maxClaims - index - 1 };
    });
  }

  async cancelInternalPacket(packetId: string): Promise<PacketRecord> {
    if (!this.configured) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Persistent packet storage is not configured");
    const rows = await this.database.query<PacketRow>(`UPDATE packet_records SET cancelled_at = COALESCE(cancelled_at, now()) WHERE id = $1::uuid
      RETURNING id, round_id, provider, total_amount, max_claims, claimed_amount, claimed_count, created_at, expires_at, cancelled_at`, [packetId]);
    const row = rows[0];
    if (!row) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Internal packet not found");
    return packetRecord(row, row.round_id ?? this.roundDatabaseId);
  }

  private async run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (!this.configured) return undefined;
    try { return await work(); } catch (error) {
      if (this.strict) throw error;
      console.error(`database persistence warning: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  async getIdempotency(key: string): Promise<unknown | undefined> {
    const rows = await this.run(() => this.database.query<{ result: unknown }>("SELECT result FROM idempotency_keys WHERE key = $1", [key]));
    return rows?.[0]?.result;
  }

  async putIdempotency(key: string, actor: string, result: unknown): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO idempotency_keys (key, actor, result) VALUES ($1, $2, $3::jsonb) ON CONFLICT (key) DO NOTHING", [key, actor, JSON.stringify(result)]).then(() => undefined));
  }

  async upsertTelegramIdentity(telegramUserId: string, username: string | undefined, verified: boolean, locale = "zh-CN"): Promise<void> {
    await this.run(() => this.database.transaction(async (client) => {
      const user = await client.query<{ id: string }>("INSERT INTO users (internal_uid, display_name) VALUES ($1, $2) ON CONFLICT (internal_uid) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now() RETURNING id", [`TG-${telegramUserId}`, username ? `@${username}` : `Telegram ${telegramUserId}`]);
      const userId = user.rows[0]?.id;
      if (!userId) throw new Error("Unable to persist Telegram user");
      await client.query("INSERT INTO user_profiles (user_id, locale) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET locale = EXCLUDED.locale, updated_at = now()", [userId, locale]);
      await client.query("INSERT INTO wallet_accounts (user_id, account_type, balance) VALUES ($1, 'USER_AVAILABLE', 12500), ($1, 'USER_LOCKED', 0), ($1, 'USER_LOCKED_BANKER_POOL', 0) ON CONFLICT (user_id, account_type) DO NOTHING", [userId]);
      await client.query("INSERT INTO telegram_identities (user_id, telegram_user_id, username, init_data_verified_at) VALUES ($1, $2, $3, CASE WHEN $4 THEN now() ELSE NULL END) ON CONFLICT (telegram_user_id) DO UPDATE SET user_id = EXCLUDED.user_id, username = EXCLUDED.username, init_data_verified_at = CASE WHEN $4 THEN now() ELSE telegram_identities.init_data_verified_at END", [userId, telegramUserId, username ?? null, verified]);
    }));
  }

  async loadUserLocale(telegramUserId: string): Promise<string | undefined> {
    if (!this.configured) return undefined;
    const rows = await this.database.query<{ locale: string }>("SELECT up.locale FROM user_profiles up JOIN telegram_identities ti ON ti.user_id = up.user_id WHERE ti.telegram_user_id = $1", [telegramUserId]);
    return rows[0]?.locale;
  }

  async persistUserLocale(telegramUserId: string, locale: string): Promise<void> {
    await this.run(() => this.database.query("UPDATE user_profiles up SET locale = $2, updated_at = now() FROM telegram_identities ti WHERE up.user_id = ti.user_id AND ti.telegram_user_id = $1", [telegramUserId, locale]).then(() => undefined));
  }

  async createSession(telegramUserId: string, token: string, expiresAt: Date): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO user_sessions (user_id, session_hash, expires_at) SELECT user_id, $2, $3 FROM telegram_identities WHERE telegram_user_id = $1 ON CONFLICT (session_hash) DO NOTHING", [telegramUserId, createHash("sha256").update(token).digest("hex"), expiresAt]).then(() => undefined));
  }

  async findSession(token: string): Promise<{ userId: string; role: "PLAYER" | "ADMIN"; expiresAt: Date } | undefined> {
    const sessionHash = createHash("sha256").update(token).digest("hex");
    const rows = await this.run(() => this.database.query<{ user_id: string; role: "PLAYER" | "ADMIN"; expires_at: Date }>("SELECT COALESCE(ti.telegram_user_id, u.internal_uid, u.id::text) AS user_id, u.role, us.expires_at FROM user_sessions us JOIN users u ON u.id = us.user_id LEFT JOIN telegram_identities ti ON ti.user_id = u.id WHERE us.session_hash = $1 AND us.revoked_at IS NULL AND us.expires_at > now()", [sessionHash]));
    const row = rows?.[0];
    return row ? { userId: row.user_id, role: row.role === "ADMIN" ? "ADMIN" : "PLAYER", expiresAt: row.expires_at } : undefined;
  }

  async recordTelegramUpdate(updateId: number, updateType: string, payload: unknown): Promise<boolean> {
    if (!this.configured) {
      if (this.strict) throw new Error("DATABASE_REQUIRED: Telegram updates require persistent storage");
      return true;
    }
    const rows = await this.database.query<{ update_id: number }>("INSERT INTO telegram_updates (update_id, update_type, payload) VALUES ($1, $2, $3::jsonb) ON CONFLICT (update_id) DO NOTHING RETURNING update_id", [updateId, updateType, JSON.stringify(payload)]);
    return Boolean(rows[0]);
  }

  async enqueueTelegramUpdate(updateId: number, updateType: string, payload: unknown): Promise<boolean> {
    if (!this.configured) {
      if (this.strict) throw new Error("DATABASE_REQUIRED: Telegram updates require persistent storage");
      return true;
    }
    return this.database.transaction(async (client) => {
      const inserted = await client.query<{ update_id: number }>("INSERT INTO telegram_updates (update_id, update_type, payload) VALUES ($1, $2, $3::jsonb) ON CONFLICT (update_id) DO NOTHING RETURNING update_id", [updateId, updateType, JSON.stringify(payload)]);
      if (!inserted.rows[0]) return false;
      await client.query("INSERT INTO outbox_events (event_type, payload) VALUES ($1, $2::jsonb)", ["TELEGRAM_UPDATE_RECEIVED", JSON.stringify({ updateId, updateType, update: payload })]);
      return true;
    });
  }

  async getTelegramUpdate(updateId: number): Promise<{ payload: Record<string, unknown>; published: boolean } | undefined> {
    if (!this.configured) return undefined;
    const rows = await this.database.query<{ payload: Record<string, unknown>; published: boolean }>(`SELECT tu.payload,
      EXISTS (SELECT 1 FROM outbox_events oe WHERE oe.event_type = 'TELEGRAM_UPDATE_RECEIVED' AND oe.payload->>'updateId' = $1 AND oe.published_at IS NOT NULL) AS published
      FROM telegram_updates tu WHERE tu.update_id = $1`, [updateId]);
    const row = rows[0];
    return row ? { payload: row.payload, published: row.published } : undefined;
  }

  async markTelegramUpdatePublished(updateId: number): Promise<void> {
    await this.run(() => this.database.query("UPDATE outbox_events SET published_at = COALESCE(published_at, now()), claimed_at = NULL, claimed_by = NULL, last_error = NULL WHERE event_type = 'TELEGRAM_UPDATE_RECEIVED' AND payload->>'updateId' = $1", [String(updateId)]).then(() => undefined));
  }

  async claimTelegramUpdate(updateId: number, claimedBy: string): Promise<boolean> {
    if (!this.configured) return !this.strict;
    const rows = await this.database.query<{ id: string }>(`UPDATE outbox_events SET claimed_at = now(), claimed_by = $2, attempt_count = attempt_count + 1
      WHERE event_type = 'TELEGRAM_UPDATE_RECEIVED' AND payload->>'updateId' = $1 AND published_at IS NULL
        AND (claimed_at IS NULL OR claimed_at < now() - interval '60 seconds') RETURNING id`, [String(updateId), claimedBy]);
    return Boolean(rows[0]);
  }

  async releaseTelegramUpdate(updateId: number, claimedBy: string, error?: unknown): Promise<void> {
    if (!this.configured) return;
    const message = error instanceof Error ? error.message : undefined;
    await this.database.query(`UPDATE outbox_events SET claimed_at = NULL, claimed_by = NULL, last_error = $3
      WHERE event_type = 'TELEGRAM_UPDATE_RECEIVED' AND payload->>'updateId' = $1 AND claimed_by = $2 AND published_at IS NULL`, [String(updateId), claimedBy, message?.slice(0, 500) ?? null]);
  }

  async persistWorkerHeartbeat(workerId: string, status = "healthy"): Promise<void> {
    if (!this.configured) {
      if (this.strict) throw new Error("DATABASE_REQUIRED: Worker heartbeat requires persistent storage");
      return;
    }
    await this.database.query("INSERT INTO worker_heartbeats (worker_id, status, heartbeat_at) VALUES ($1, $2, now()) ON CONFLICT (worker_id) DO UPDATE SET status = EXCLUDED.status, heartbeat_at = now()", [workerId, status]);
  }

  async latestWorkerHeartbeat(): Promise<WorkerHeartbeat | undefined> {
    if (!this.configured) return undefined;
    const rows = await this.database.query<WorkerHeartbeat>("SELECT worker_id AS \"workerId\", status, heartbeat_at AS \"heartbeatAt\" FROM worker_heartbeats ORDER BY heartbeat_at DESC LIMIT 1");
    return rows[0];
  }

  async loadRoundRuntime(): Promise<RoundRuntimeSnapshot | undefined> {
    if (!this.configured) return undefined;
    const rows = await this.database.query<{ round_id: string; state: RoundState; state_ends_at?: string | Date | null; banker_user_id?: string; banker_pool: string | number }>(`SELECT r.id::text AS round_id, r.state, r.state_ends_at, r.banker_user_id,
      COALESCE((SELECT balance FROM wallet_accounts WHERE user_id IS NULL AND account_type = 'BANKER_POOL'), 0) AS banker_pool
      FROM rounds r
      WHERE r.id = COALESCE(
        (SELECT gr.active_round_id FROM game_rooms gr
          JOIN rounds seed_round ON seed_round.room_id = gr.id
          WHERE seed_round.id = $1::uuid),
        $1::uuid
      )`, [this.roundDatabaseId]);
    const row = rows[0];
    if (!row) return undefined;
    this.currentRoundId = row.round_id;
    return { roundId: row.round_id, state: row.state, ...(row.state_ends_at ? { stateEndsAt: iso(row.state_ends_at) } : {}), bankerUserId: row.banker_user_id, bankerPool: Number(row.banker_pool) };
  }

  async persistDevice(telegramUserId: string, publicKey: string): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO device_bindings (user_id, device_public_key) SELECT user_id, $2 FROM telegram_identities WHERE telegram_user_id = $1 ON CONFLICT (device_public_key) DO NOTHING", [telegramUserId, publicKey]).then(() => undefined));
  }

  async persistPin(telegramUserId: string, encodedHash: string): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO security_pins (user_id, pin_hash) SELECT user_id, $2 FROM telegram_identities WHERE telegram_user_id = $1 ON CONFLICT (user_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, changed_at = now()", [telegramUserId, encodedHash]).then(() => undefined));
  }

  async persistReferral(telegramUserId: string, code: string, source: string): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO referral_edges (referrer_user_id, referred_user_id, referral_code, source) SELECT rc.user_id, ti.user_id, rc.code, $3 FROM referral_codes rc CROSS JOIN telegram_identities ti WHERE rc.code = $1 AND ti.telegram_user_id = $2 ON CONFLICT (referred_user_id) DO NOTHING", [code === "DEMO-INVITE" ? "P12-DEMO-01" : code, telegramUserId, source]).then(() => undefined));
  }

  async persistBankerBid(telegramUserId: string, amount: number, roundId?: string): Promise<void> {
    const databaseRoundId = this.databaseRoundId(roundId);
    await this.run(() => this.database.transaction(async (client) => {
      await client.query("INSERT INTO banker_bids (round_id, user_id, amount) SELECT $1, ti.user_id, $3 FROM telegram_identities ti WHERE ti.telegram_user_id = $2 ON CONFLICT (round_id, user_id) DO UPDATE SET amount = EXCLUDED.amount", [databaseRoundId, telegramUserId, amount]);
      await client.query(`INSERT INTO round_participants (round_id, user_id, role, status, bet_amount)
        SELECT $1, ti.user_id, 'BANKER', 'ELIGIBLE', NULL FROM telegram_identities ti WHERE ti.telegram_user_id = $2
        ON CONFLICT (round_id, user_id) DO UPDATE SET role = 'BANKER', status = 'ELIGIBLE'`, [databaseRoundId, telegramUserId]);
    }));
  }

  async listBankerBids(roundId?: string): Promise<Array<{ userId: string; amount: number; serverReceivedAt: string }>> {
    if (!this.configured) return [];
    const rows = await this.database.query<{ telegram_user_id: string; amount: string | number; created_at: string | Date }>(`SELECT ti.telegram_user_id, bb.amount, bb.created_at
      FROM banker_bids bb JOIN telegram_identities ti ON ti.user_id = bb.user_id
      WHERE bb.round_id = $1 ORDER BY bb.amount DESC, bb.created_at ASC, bb.id ASC`, [this.databaseRoundId(roundId)]);
    return rows.map((row) => ({ userId: row.telegram_user_id, amount: Number(row.amount), serverReceivedAt: new Date(row.created_at).toISOString() }));
  }

  async persistRoundBanker(telegramUserId: string, roundId?: string): Promise<void> {
    await this.run(() => this.database.query(`UPDATE rounds SET banker_user_id = (SELECT user_id FROM telegram_identities WHERE telegram_user_id = $2) WHERE id = $1`, [this.databaseRoundId(roundId), telegramUserId]).then(() => undefined));
  }

  async persistBet(telegramUserId: string, amount: number, roundId?: string): Promise<void> {
    const databaseRoundId = this.databaseRoundId(roundId);
    await this.run(() => this.database.transaction(async (client) => {
      await client.query("INSERT INTO bets (round_id, user_id, bet_sequence, amount) SELECT $1, ti.user_id, COALESCE((SELECT max(bet_sequence) + 1 FROM bets b WHERE b.round_id = $1 AND b.user_id = ti.user_id), 1), $3 FROM telegram_identities ti WHERE ti.telegram_user_id = $2 ON CONFLICT (round_id, user_id, bet_sequence) DO NOTHING", [databaseRoundId, telegramUserId, amount]);
      await client.query(`INSERT INTO round_participants (round_id, user_id, role, status, bet_amount)
        SELECT $1, ti.user_id, 'PLAYER', 'ELIGIBLE', SUM(b.amount) FROM telegram_identities ti
        JOIN bets b ON b.user_id = ti.user_id AND b.round_id = $1
        WHERE ti.telegram_user_id = $2 GROUP BY ti.user_id
        ON CONFLICT (round_id, user_id) DO UPDATE SET role = 'PLAYER', status = 'ELIGIBLE', bet_amount = EXCLUDED.bet_amount`, [databaseRoundId, telegramUserId]);
    }));
  }

  async listRoundBettors(roundId?: string): Promise<Array<{ userId: string; amount: number }>> {
    if (!this.configured) return [];
    const rows = await this.database.query<{ telegram_user_id: string; amount: string | number }>(`SELECT ti.telegram_user_id, COALESCE(rp.bet_amount, 0) AS amount
      FROM round_participants rp JOIN telegram_identities ti ON ti.user_id = rp.user_id
      WHERE rp.round_id = $1 AND rp.role = 'PLAYER' AND rp.status IN ('ELIGIBLE', 'CLAIMED', 'AUTO_CLAIMED')
      ORDER BY rp.joined_at, rp.id`, [this.databaseRoundId(roundId)]);
    return rows.map((row) => ({ userId: row.telegram_user_id, amount: Number(row.amount) }));
  }

  async persistPacketAllocations(packetId: string, bettors: Array<{ userId: string; amount: number }>): Promise<void> {
    await this.run(() => this.database.transaction(async (client) => {
      for (const bettor of bettors) {
        await client.query(`INSERT INTO packet_allocations (round_id, packet_id, user_id, allocation_amount, claim_status)
          SELECT p.round_id, p.id, ti.user_id, NULL, 'ELIGIBLE' FROM packet_records p
          JOIN telegram_identities ti ON ti.telegram_user_id = $2 WHERE p.id = $1::uuid
          ON CONFLICT (round_id, user_id) DO UPDATE SET packet_id = EXCLUDED.packet_id, claim_status = 'ELIGIBLE', claimed_at = NULL`, [packetId, bettor.userId]);
      }
    }));
  }

  async persistPacket(provider: string, serverSeedHash: string, serverSeed?: string, roundId?: string): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO packet_records (round_id, provider, server_seed_hash, server_seed) VALUES ($1, $2, $3, $4) ON CONFLICT (round_id) DO UPDATE SET provider = EXCLUDED.provider, server_seed_hash = EXCLUDED.server_seed_hash, server_seed = COALESCE(EXCLUDED.server_seed, packet_records.server_seed)", [this.databaseRoundId(roundId), provider, serverSeedHash, serverSeed ?? null]).then(() => undefined));
  }

  async persistPacketClaim(telegramUserId: string, claimSequence: number, packetValue: number, roundId?: string): Promise<void> {
    const databaseRoundId = this.databaseRoundId(roundId);
    await this.run(() => this.database.transaction(async (client) => {
      const rows = await client.query<{ user_id: string }>("SELECT user_id FROM telegram_identities WHERE telegram_user_id = $1", [telegramUserId]);
      const userId = rows.rows[0]?.user_id;
      if (!userId) throw new Error("Unable to persist packet claim user");
      await client.query("INSERT INTO claim_records (packet_id, round_id, user_id, claim_sequence, demo_value) SELECT id, $1, $2, $3, $4 FROM packet_records WHERE round_id = $1 ON CONFLICT (round_id, user_id, claim_sequence) DO NOTHING", [databaseRoundId, userId, claimSequence, packetValue]);
    }));
  }

  async persistHand(telegramUserId: string, points: number, handType: string, cards: number[], roundId?: string): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO hands (round_id, user_id, points, hand_type, cards) SELECT $1, ti.user_id, $3, $4, $5::jsonb FROM telegram_identities ti WHERE ti.telegram_user_id = $2 ON CONFLICT (round_id, user_id) DO UPDATE SET points = EXCLUDED.points, hand_type = EXCLUDED.hand_type, cards = EXCLUDED.cards", [this.databaseRoundId(roundId), telegramUserId, points, handType, JSON.stringify(cards)]).then(() => undefined));
  }

  async persistSettlement(telegramUserId: string, settlementType: string, roundId?: string): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO settlements (round_id, user_id, settlement_type, status) SELECT $1, ti.user_id, $3, 'POSTED' FROM telegram_identities ti WHERE ti.telegram_user_id = $2 ON CONFLICT (round_id, user_id, settlement_type) DO UPDATE SET status = 'POSTED'", [this.databaseRoundId(roundId), telegramUserId, settlementType]).then(() => undefined));
  }

  async createWebAppLaunchGrant(input: { updateId: number; telegramUserId: string; chatId: string; token: string; expiresAt: Date }): Promise<void> {
    if (!this.configured) {
      if (this.strict) throw new Error("DATABASE_REQUIRED: Web App launch grants require persistent storage");
      return;
    }
    await this.database.query(`INSERT INTO telegram_launch_grants (update_id, telegram_user_id, chat_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (update_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at
      WHERE telegram_launch_grants.used_at IS NULL`, [input.updateId, input.telegramUserId, input.chatId, telegramLaunchTokenHash(input.token), input.expiresAt]);
  }

  async consumeWebAppLaunchGrant(token: string): Promise<string | undefined> {
    if (!this.configured) return undefined;
    return this.database.transaction(async (client) => {
      const rows = await client.query<{ telegram_user_id: string }>(`SELECT telegram_user_id FROM telegram_launch_grants
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`, [telegramLaunchTokenHash(token)]);
      const row = rows.rows[0];
      if (!row) return undefined;
      await client.query("UPDATE telegram_launch_grants SET used_at = now() WHERE token_hash = $1", [telegramLaunchTokenHash(token)]);
      return row.telegram_user_id;
    });
  }

  async persistRoundEvent(event: RoundEventInput): Promise<void> {
    await this.run(() => this.database.transaction(async (client) => {
      const roundId = this.databaseRoundId(event.roundId);
      const updated = await client.query<{ id: string }>("UPDATE rounds SET state = $2, state_started_at = now(), state_ends_at = $3, state_version = state_version + 1 WHERE id = $1 AND ($4::text IS NULL OR state = $4) RETURNING id", [roundId, event.to, event.stateEndsAt ?? null, event.from ?? null]);
      if (!updated.rows[0]) throw new Error(`ROUND_STATE_CONFLICT: expected ${event.from ?? "current"}`);
      await client.query("INSERT INTO round_events (round_id, from_state, to_state, payload, actor) VALUES ($1, $2, $3, $4::jsonb, $5)", [roundId, event.from ?? null, event.to, JSON.stringify(event.payload), event.actor]);
    }));
  }

  async persistOutbox(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO outbox_events (event_type, payload) VALUES ($1, $2::jsonb)", [type, JSON.stringify(payload)]).then(() => undefined));
  }

  async persistAudit(input: AuditInput): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO audit_logs (actor, action, reference_type, reference_id, before_state, after_state) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)", [input.actor, input.action, input.referenceType, input.referenceId, input.before === undefined ? null : JSON.stringify(input.before), input.after === undefined ? null : JSON.stringify(input.after)]).then(() => undefined));
  }

  async persistJournal(journal: Journal, telegramUserId?: string): Promise<void> {
    await this.run(() => this.database.transaction(async (client: QueryExecutor) => {
      const inserted = await client.query<{ id: string }>("INSERT INTO ledger_journals (reference_type, reference_id, idempotency_key, reason, created_by) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id", [journal.referenceType, journal.referenceId, journal.idempotencyKey, journal.reason, "api"]);
      if (!inserted.rows[0]) return;
      for (const line of journal.lines) {
        const account = await client.query<{ id: string }>("SELECT wa.id FROM wallet_accounts wa WHERE wa.account_type = $1 AND (wa.user_id IS NULL OR ($2::text IS NOT NULL AND EXISTS (SELECT 1 FROM users u LEFT JOIN telegram_identities ti ON ti.user_id = u.id WHERE u.id = wa.user_id AND (ti.telegram_user_id = $2 OR u.internal_uid IN ($2, CONCAT('TG-', $2)))))) ORDER BY (wa.user_id IS NULL) ASC LIMIT 1", [line.account, telegramUserId ?? null]);
        const accountId = account.rows[0]?.id;
        if (!accountId) throw new Error(`Missing wallet account ${line.account}`);
        await client.query("INSERT INTO ledger_lines (journal_id, account_id, direction, amount) VALUES ($1, $2, $3, $4)", [inserted.rows[0].id, accountId, line.direction, line.amount]);
        await client.query("UPDATE wallet_accounts SET balance = balance + $1 WHERE id = $2", [line.direction === "DEBIT" ? -line.amount : line.amount, accountId]);
      }
    }));
  }
}
