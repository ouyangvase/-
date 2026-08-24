import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd --filter @project12/api dev" : "pnpm --filter @project12/api dev";
const child = spawn(command, {
  env: {
    ...process.env,
    APP_MODE: "demo",
    TELEGRAM_MOCK_ENABLED: "true",
    DEMO_AUTO_ROUND: "true"
  },
  shell: true,
  stdio: "inherit"
});

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
