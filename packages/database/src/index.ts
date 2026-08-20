import pg from "pg";
import type { Pool as PgPool, PoolClient, QueryResultRow } from "pg";

const { Pool } = pg;

export type QueryExecutor = Pick<PoolClient, "query">;

export class Project12Database {
  readonly configured: boolean;
  private readonly pool: PgPool | undefined;

  constructor(connectionString = process.env.DATABASE_URL) {
    this.configured = Boolean(connectionString);
    this.pool = connectionString ? new Pool({ connectionString, max: 10 }) : undefined;
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
    if (!this.pool) return [];
    const result = await this.pool.query<T>(text, values);
    return result.rows;
  }

  async transaction<T>(work: (client: QueryExecutor) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error("DATABASE_URL is required for a database transaction");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async health(): Promise<"disabled" | "healthy" | "unavailable"> {
    if (!this.pool) return "disabled";
    try {
      const canonicalRoundId = process.env.DEMO_ROUND_DB_ID ?? "00000000-0000-0000-0001-000000000004";
      const result = await this.pool.query<{ ready: boolean }>(`SELECT
        to_regclass('public.users') IS NOT NULL
        AND to_regclass('public.telegram_identities') IS NOT NULL
        AND to_regclass('public.rounds') IS NOT NULL
        AND to_regclass('public.ledger_journals') IS NOT NULL
        AND to_regclass('public.outbox_events') IS NOT NULL
        AND to_regclass('public.telegram_launch_grants') IS NOT NULL
        AND to_regclass('public.worker_heartbeats') IS NOT NULL
        AND EXISTS (SELECT 1 FROM rounds WHERE id::text = $1)
        AND EXISTS (SELECT 1 FROM wallet_accounts WHERE user_id IS NULL AND account_type = 'BANKER_POOL') AS ready`, [canonicalRoundId]);
      return result.rows[0]?.ready ? "healthy" : "unavailable";
    } catch { return "unavailable"; }
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }
}
