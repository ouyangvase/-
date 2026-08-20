import { existsSync, readFileSync } from "node:fs";

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

export function loadEnvFile() {
  const requested = process.env.PROJECT12_ENV_FILE;
  const files = requested ? [requested] : [".env.staging.local", ".env.local", ".env"];
  const file = files.find((candidate) => existsSync(candidate));
  if (!file) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = unquote(match[2]);
  }
}
