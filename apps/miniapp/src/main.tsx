import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./components/mechanism/mechanism.css";

const TELEGRAM_BRIDGE_SRC = "https://telegram.org/js/telegram-web-app.js";

function hasTelegramInitData(): boolean {
  const telegram = globalThis as typeof globalThis & {
    Telegram?: { WebApp?: { initData?: string } };
  };
  return Boolean(telegram.Telegram?.WebApp?.initData?.trim());
}

function waitForTelegramInitData(timeoutMs = 8_000): Promise<void> {
  if (hasTelegramInitData()) return Promise.resolve();

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (hasTelegramInitData() || Date.now() >= deadline) {
        resolve();
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}

function loadTelegramBridge(): Promise<void> {
  if (!import.meta.env.PROD || hasTelegramInitData()) return Promise.resolve();

  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[src="${TELEGRAM_BRIDGE_SRC}"]`,
  );
  const bridgeLoad = existingScript
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        const script = document.createElement("script");
        script.src = TELEGRAM_BRIDGE_SRC;
        script.async = false;
        script.onload = () => resolve();
        script.onerror = () => resolve();
        document.head.appendChild(script);
      });

  return bridgeLoad.then(() => waitForTelegramInitData());
}

void loadTelegramBridge().then(() => createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>));
