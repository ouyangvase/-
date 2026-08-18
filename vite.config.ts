import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@project12/config": path.resolve(__dirname, "packages/config/src/branding.ts"),
      "@project12/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts"),
      "@project12/game-engine": path.resolve(__dirname, "packages/game-engine/src/index.ts"),
      "@project12/ledger": path.resolve(__dirname, "packages/ledger/src/index.ts"),
      "@project12/telegram": path.resolve(__dirname, "packages/telegram/src/index.ts")
    }
  },
  server: { host: "0.0.0.0", port: 4173 },
  test: { environment: "node", include: ["tests/**/*.test.ts", "packages/**/*.test.ts"] }
});
