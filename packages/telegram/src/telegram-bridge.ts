export interface TelegramThemeParams { bg_color?: string; secondary_bg_color?: string; header_bg_color?: string; bottom_bar_bg_color?: string; text_color?: string; hint_color?: string; button_color?: string; button_text_color?: string; }

export interface TelegramWebAppLike {
  initData?: string;
  startParam?: string;
  version?: string;
  platform?: string;
  colorScheme?: "light" | "dark";
  themeParams?: TelegramThemeParams;
  viewportStableHeight?: number;
  viewportHeight?: number;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  BackButton?: { show: () => void; hide: () => void; onClick: (callback: () => void) => void; offClick: (callback: () => void) => void };
  MainButton?: { show: () => void; hide: () => void; setText: (text: string) => void; onClick: (callback: () => void) => void; offClick: (callback: () => void) => void; enable: () => void; disable: () => void };
  SecondaryButton?: { show: () => void; hide: () => void; setText: (text: string) => void; onClick: (callback: () => void) => void; offClick: (callback: () => void) => void; enable: () => void; disable: () => void };
  HapticFeedback?: { impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void; notificationOccurred: (type: "error" | "success" | "warning") => void; selectionChanged: () => void };
  BiometricManager?: { isInited: boolean; isBiometricAvailable: boolean; init: (callback?: () => void) => void; authenticate: (params: { reason?: string }, callback: (success: boolean) => void) => void };
  SecureStorage?: { getItem: (key: string, callback: (error: boolean, value?: string) => void) => void; setItem: (key: string, value: string, callback: (error: boolean) => void) => void; removeItem: (key: string, callback: (error: boolean) => void) => void };
}

export function getTelegramWebApp(): TelegramWebAppLike | undefined {
  return (globalThis as typeof globalThis & { Telegram?: { WebApp?: TelegramWebAppLike } }).Telegram?.WebApp;
}

export function isTelegramWebApp(): boolean { return Boolean(getTelegramWebApp()); }
export function readTelegramInitData(): string { return getTelegramWebApp()?.initData?.trim() ?? ""; }
export function readTelegramStartParam(): string { return getTelegramWebApp()?.startParam?.trim() ?? ""; }

export function supportsVersion(webApp: TelegramWebAppLike, version: string): boolean {
  return typeof webApp.isVersionAtLeast === "function" ? webApp.isVersionAtLeast(version) : false;
}

export function applyTelegramViewport(webApp = getTelegramWebApp()): void {
  if (!webApp) return;
  const root = document.documentElement;
  const safe = webApp.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const content = webApp.contentSafeAreaInset ?? safe;
  root.style.setProperty("--tg-safe-top", `${safe.top}px`);
  root.style.setProperty("--tg-safe-bottom", `${safe.bottom}px`);
  root.style.setProperty("--tg-content-safe-top", `${content.top}px`);
  root.style.setProperty("--tg-content-safe-bottom", `${content.bottom}px`);
  if (webApp.viewportStableHeight) root.style.setProperty("--tg-viewport-stable-height", `${webApp.viewportStableHeight}px`);
}

export function initTelegramBridge(options: { onBack?: () => void } = {}): TelegramWebAppLike | undefined {
  const webApp = getTelegramWebApp();
  if (!webApp) return undefined;
  webApp.ready?.();
  webApp.expand?.();
  if (supportsVersion(webApp, "8.0")) webApp.requestFullscreen?.();
  applyTelegramViewport(webApp);
  window.addEventListener("resize", () => applyTelegramViewport(webApp), { passive: true });
  if (options.onBack && webApp.BackButton) { webApp.BackButton.onClick(options.onBack); webApp.BackButton.show(); }
  return webApp;
}

export function hapticSelection(): void { getTelegramWebApp()?.HapticFeedback?.selectionChanged(); }
export function hapticImpact(style: "light" | "medium" | "heavy" = "medium"): void { getTelegramWebApp()?.HapticFeedback?.impactOccurred(style); }
export function hapticNotification(type: "error" | "success" | "warning"): void { getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type); }
