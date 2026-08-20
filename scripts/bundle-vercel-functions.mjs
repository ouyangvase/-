import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("serverless-runtime", { recursive: true, force: true });
await build({
  entryPoints: [
    { in: "apps/api/src/server.ts", out: "api-handler" },
    { in: "serverless/telegram-webhook-entry.ts", out: "telegram-webhook" }
  ],
  outdir: "serverless-runtime",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  packages: "bundle",
  outExtension: { ".js": ".cjs" },
  logLevel: "info"
});
