import { describe, expect, it } from "vitest";
import { ApiPersistence } from "../apps/api/src/persistence";
import { Project12Database } from "../packages/database/src/index";

describe("database boundary", () => {
  it("reports an explicit disabled state without DATABASE_URL", async () => {
    const database = new Project12Database("");
    expect(database.configured).toBe(false);
    await expect(database.health()).resolves.toBe("disabled");
    await expect(database.query("SELECT 1")).resolves.toEqual([]);
  });

  it("keeps demo persistence calls safe when Postgres is not configured", async () => {
    const persistence = new ApiPersistence(new Project12Database(""));
    expect(persistence.configured).toBe(false);
    await expect(persistence.getIdempotency("missing")).resolves.toBeUndefined();
    await expect(persistence.persistOutbox("TEST", { demo: true })).resolves.toBeUndefined();
  });

  it("hydrates the active banker as the Telegram user id", async () => {
    let queryText = "";
    const database = {
      configured: true,
      query: async <T>(text: string) => {
        queryText = text;
        return [{ round_id: "round-1", state: "BETTING", banker_telegram_user_id: "tg-banker", banker_pool: "0", player_count: "3", rule_version: "12-niuniu-v1", server_seed_hash: "0123456789abcdef0123456789abcdef" }] as T[];
      }
    } as unknown as Project12Database;
    const persistence = new ApiPersistence(database);

    await expect(persistence.loadRoundRuntime()).resolves.toMatchObject({ bankerUserId: "tg-banker", playerCount: 3, ruleVersion: "12-niuniu-v1", serverSeedHash: "0123456789abcdef0123456789abcdef" });
    expect(queryText).toContain("banker_ti.telegram_user_id AS banker_telegram_user_id");
    expect(queryText).toContain("round_participants");
  });

  it("reads persisted result names using Telegram identity data", async () => {
    const database = {
      configured: true,
      query: async <T>() => [{ user_id: "tg-player", bet_amount: "10", packet_value: "8", hand_type: "牛八", hand_points: 8, outcome: "WIN", multiplier: "1", gross_reward: "8", fee: "0", net_reward: "8", banker_pool_before: "0", banker_pool_after: "0" }] as T[]
    } as unknown as Project12Database;
    const persistence = new ApiPersistence(database);

    await expect(persistence.loadRoundResults("00000000-0000-4000-8000-000000000004")).resolves.toMatchObject([{ userId: "tg-player", betAmount: 10 }]);
  });
});
