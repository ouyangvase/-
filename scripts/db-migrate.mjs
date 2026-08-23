import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadEnvFile } from "./load-env-file.mjs";
import pg from "../packages/database/node_modules/pg/lib/index.js";

loadEnvFile();

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://demo:demo@localhost:5432/project12";
const files = [resolve("infra/schema.sql"), ...readdirSync(resolve("infra/migrations")).filter((file) => file.endsWith(".sql")).sort().map((file) => resolve("infra/migrations", file))];
const psqlProbe = spawnSync("psql", ["--version"], { stdio: "ignore", shell: process.platform === "win32" });

if (!psqlProbe.error && psqlProbe.status === 0) {
  for (const file of files) {
    const result = spawnSync("psql", [databaseUrl, "--set", "ON_ERROR_STOP=1", "--file", file], { stdio: "inherit", shell: process.platform === "win32" });
    if (result.error) {
      console.error(`Unable to run psql: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
    console.log(`Migration complete: ${file}`);
  }
} else {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    for (const file of files) {
      const sql = await import("node:fs/promises").then(({ readFile }) => readFile(file, "utf8"));
      await pool.query(sql);
      console.log(`Migration complete: ${file}`);
    }
  } finally {
    await pool.end();
  }
}
