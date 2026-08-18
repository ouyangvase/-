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
});
