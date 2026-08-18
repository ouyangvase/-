import { createHash } from "node:crypto";
import { Project12Database, type QueryExecutor } from "@project12/database";
import type { Journal } from "@project12/ledger";
import type { RoundState } from "@project12/contracts";

const defaultRoundId = "00000000-0000-0000-0001-000000000004";

type AuditInput = { actor: string; action: string; referenceType: string; referenceId: string; before?: unknown; after?: unknown };
type RoundEventInput = { roundId: string; from?: RoundState; to: RoundState; payload: Record<string, unknown>; actor: string };

export class ApiPersistence {
  private readonly database: Project12Database;
  private readonly strict: boolean;
  readonly roundDatabaseId = process.env.DEMO_ROUND_DB_ID ?? defaultRoundId;

  constructor(database = new Project12Database()) {
    this.database = database;
    this.strict = (process.env.APP_MODE ?? "demo") !== "demo";
  }

  get configured(): boolean { return this.database.configured; }

  async health(): Promise<"disabled" | "healthy" | "unavailable"> {
    return this.database.health();
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

  async upsertTelegramIdentity(telegramUserId: string, username: string | undefined, verified: boolean): Promise<void> {
    await this.run(() => this.database.transaction(async (client) => {
      const user = await client.query<{ id: string }>("INSERT INTO users (internal_uid, display_name) VALUES ($1, $2) ON CONFLICT (internal_uid) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now() RETURNING id", [`TG-${telegramUserId}`, username ? `@${username}` : `Telegram ${telegramUserId}`]);
      const userId = user.rows[0]?.id;
      if (!userId) throw new Error("Unable to persist Telegram user");
      await client.query("INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
      await client.query("INSERT INTO wallet_accounts (user_id, account_type, balance) VALUES ($1, 'USER_AVAILABLE', 0), ($1, 'USER_LOCKED', 0), ($1, 'USER_LOCKED_BANKER_POOL', 0) ON CONFLICT (user_id, account_type) DO NOTHING", [userId]);
      await client.query("INSERT INTO telegram_identities (user_id, telegram_user_id, username, init_data_verified_at) VALUES ($1, $2, $3, CASE WHEN $4 THEN now() ELSE NULL END) ON CONFLICT (telegram_user_id) DO UPDATE SET user_id = EXCLUDED.user_id, username = EXCLUDED.username, init_data_verified_at = CASE WHEN $4 THEN now() ELSE telegram_identities.init_data_verified_at END", [userId, telegramUserId, username ?? null, verified]);
    }));
  }

  async createSession(telegramUserId: string, token: string, expiresAt: Date): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO user_sessions (user_id, session_hash, expires_at) SELECT user_id, $2, $3 FROM telegram_identities WHERE telegram_user_id = $1 ON CONFLICT (session_hash) DO NOTHING", [telegramUserId, createHash("sha256").update(token).digest("hex"), expiresAt]).then(() => undefined));
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

  async persistBankerBid(telegramUserId: string, amount: number): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO banker_bids (round_id, user_id, amount) SELECT $1, u.id, $3 FROM users u WHERE u.internal_uid IN ($2, CONCAT('TG-', $2)) ON CONFLICT (round_id, user_id) DO UPDATE SET amount = EXCLUDED.amount", [this.roundDatabaseId, telegramUserId, amount]).then(() => undefined));
  }

  async persistRoundEvent(event: RoundEventInput): Promise<void> {
    await this.run(() => this.database.query("INSERT INTO round_events (round_id, from_state, to_state, payload, actor) VALUES ($1, $2, $3, $4::jsonb, $5)", [this.roundDatabaseId, event.from ?? null, event.to, JSON.stringify(event.payload), event.actor]).then(() => undefined));
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
