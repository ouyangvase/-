import type { Locale } from "@project12/i18n";

export type BootStatus = "loading" | "ready" | "offline" | "error";
export type BootStepStatus = "passed" | "failed" | "pending" | "skipped";

export type BootDiagnostic = {
  id: "telegram" | "init-data" | "signature" | "session" | "services";
  label: string;
  status: BootStepStatus;
  detail: string;
};

function isAuthFailure(reason: string): boolean {
  return /(auth|signature|signed|initdata|init data|身份验证|签名|授权|过期|expired|launch)/i.test(reason);
}

export function createBootDiagnostics({
  locale,
  telegramShell,
  initDataPresent,
  launchTokenPresent,
  bootStatus,
  reason,
}: {
  locale: Locale;
  telegramShell: boolean;
  initDataPresent: boolean;
  launchTokenPresent: boolean;
  bootStatus: BootStatus;
  reason: string;
}): BootDiagnostic[] {
  const zh = locale === "zh-CN" || locale === "zh-TW";
  const hasLaunchContext = initDataPresent || launchTokenPresent;
  const authFailed = bootStatus === "error" && isAuthFailure(reason);
  const bootFailed = bootStatus === "error" && !authFailed;
  const contextStatus: BootStepStatus = telegramShell ? "passed" : "failed";
  const initStatus: BootStepStatus = !telegramShell ? "skipped" : hasLaunchContext ? "passed" : bootStatus === "loading" ? "pending" : "failed";
  const signatureStatus: BootStepStatus = !hasLaunchContext ? "skipped" : authFailed ? "failed" : bootStatus === "ready" || bootFailed ? "passed" : bootStatus === "loading" ? "pending" : "failed";
  const sessionStatus: BootStepStatus = authFailed || !hasLaunchContext ? "skipped" : bootStatus === "ready" || bootFailed ? "passed" : bootStatus === "loading" ? "pending" : "failed";
  const servicesStatus: BootStepStatus = bootStatus === "ready" ? "passed" : bootFailed ? "failed" : authFailed || !hasLaunchContext ? "skipped" : "pending";

  return [
    {
      id: "telegram",
      label: zh ? "Telegram 环境" : "Telegram environment",
      status: contextStatus,
      detail: telegramShell ? (zh ? "已检测到 Telegram WebView" : "Telegram WebView detected") : (zh ? "请从 Bot 的 Launch App 或 Menu Button 打开" : "Open this from the bot's Launch App or Menu Button"),
    },
    {
      id: "init-data",
      label: zh ? "原始 initData" : "Raw initData",
      status: initStatus,
      detail: hasLaunchContext ? (launchTokenPresent && !initDataPresent ? (zh ? "已取得 Telegram launch grant" : "Telegram launch grant received") : (zh ? "已取得 Telegram initData" : "Telegram initData received")) : (zh ? "Telegram 没有传入启动授权数据" : "Telegram did not provide launch authorization data"),
    },
    {
      id: "signature",
      label: zh ? "Telegram 签名验签" : "Telegram signature",
      status: signatureStatus,
      detail: signatureStatus === "passed" ? (zh ? "服务端验签通过" : "Server-side signature verified") : authFailed ? (zh ? "服务端拒绝了 Telegram 授权数据" : "The server rejected the Telegram auth data") : (zh ? "等待服务端验签" : "Waiting for server verification"),
    },
    {
      id: "session",
      label: zh ? "App Session" : "App session",
      status: sessionStatus,
      detail: sessionStatus === "passed" ? (zh ? "登录 session 已创建" : "Login session created") : authFailed ? (zh ? "验签未通过，无法创建 session" : "Session cannot be created before verification") : (zh ? "等待认证完成" : "Waiting for authentication"),
    },
    {
      id: "services",
      label: zh ? "DB / Realtime / Room Engine" : "DB / Realtime / Room Engine",
      status: servicesStatus,
      detail: servicesStatus === "passed" ? (zh ? "生产服务检查通过" : "Production services are healthy") : bootFailed ? (zh ? "认证后服务或生产牌局未就绪" : "A production service or room is not ready") : (zh ? "等待登录链路完成" : "Waiting for the login chain"),
    },
  ];
}
