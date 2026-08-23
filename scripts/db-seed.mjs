import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadEnvFile } from "./load-env-file.mjs";

loadEnvFile();

if (process.env.NODE_ENV === "production" || process.env.APP_MODE === "production") {
  console.error("Refusing to run the local seed in production. Apply migrations and provision real production data instead.");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://demo:demo@localhost:5432/project12";
const seed = resolve("infra/seed.sql");
const result = spawnSync("psql", [databaseUrl, "--set", "ON_ERROR_STOP=1", "--file", seed], { stdio: "inherit", shell: process.platform === "win32" });
if (result.error) {
  console.error(`Unable to run psql. Start PostgreSQL or use docker compose first: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Seed complete: infra/seed.sql");
