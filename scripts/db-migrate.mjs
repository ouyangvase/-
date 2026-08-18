import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://demo:demo@localhost:5432/project12";
const files = [resolve("infra/schema.sql"), ...readdirSync(resolve("infra/migrations")).filter((file) => file.endsWith(".sql")).sort().map((file) => resolve("infra/migrations", file))];
for (const file of files) {
  const result = spawnSync("psql", [databaseUrl, "--set", "ON_ERROR_STOP=1", "--file", file], { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) {
    console.error(`Unable to run psql. Start PostgreSQL or use docker compose first: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Migration complete: ${file}`);
}
