import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "local";
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0-demo";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(buildId),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion)
  },
  resolve: {
    alias: {
      "@project12/config": path.resolve(__dirname, "packages/config/src/branding.ts"),
      "@project12/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts"),
      "@project12/game-engine": path.resolve(__dirname, "packages/game-engine/src/index.ts"),
      "@project12/i18n": path.resolve(__dirname, "packages/i18n/src/index.ts"),
      "@project12/ledger": path.resolve(__dirname, "packages/ledger/src/index.ts"),
      "@project12/telegram": path.resolve(__dirname, "packages/telegram/src/index.ts")
    }
  },
  server: { host: "0.0.0.0", port: 4173 },
  test: { environment: "node", include: ["tests/**/*.test.ts", "packages/**/*.test.ts"] }
});
