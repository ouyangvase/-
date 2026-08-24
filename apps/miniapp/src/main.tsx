import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./components/mechanism/mechanism.css";

function loadTelegramBridge(): Promise<void> {
  const telegram = globalThis as typeof globalThis & {
    Telegram?: { WebApp?: unknown };
  };
  if (!import.meta.env.PROD || telegram.Telegram?.WebApp) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

void loadTelegramBridge().then(() => createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>));
