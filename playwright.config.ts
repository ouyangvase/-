import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: [
    { command: "pnpm --filter @project12/api dev", url: "http://127.0.0.1:8787/health", reuseExistingServer: true },
    { command: "pnpm --filter @project12/miniapp dev --host 127.0.0.1", url: "http://127.0.0.1:4173", reuseExistingServer: true }
  ],
  projects: [
    { name: "mobile-375x667", use: { browserName: "chromium", viewport: { width: 375, height: 667 } } },
    { name: "mobile-390x844", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "mobile-430x932", use: { browserName: "chromium", viewport: { width: 430, height: 932 } } },
    { name: "mobile-360x800", use: { browserName: "chromium", viewport: { width: 360, height: 800 } } },
    { name: "mobile-412x915", use: { browserName: "chromium", viewport: { width: 412, height: 915 } } },
    { name: "mobile-480x900", use: { browserName: "chromium", viewport: { width: 480, height: 900 } } }
  ]
});
