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
  onEvent?: (event: "viewportChanged" | "themeChanged", callback: () => void) => void;
  offEvent?: (event: "viewportChanged" | "themeChanged", callback: () => void) => void;
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
  root.style.setProperty("--tg-content-safe-area-inset-top", `${content.top}px`);
  root.style.setProperty("--tg-content-safe-area-inset-bottom", `${content.bottom}px`);
  if (webApp.viewportStableHeight) root.style.setProperty("--tg-viewport-stable-height", `${webApp.viewportStableHeight}px`);
}

export function applyTelegramTheme(webApp = getTelegramWebApp()): void {
  if (!webApp) return;
  const theme = webApp.themeParams ?? {};
  const background = theme.bg_color ?? "#0b0c10";
  const header = theme.header_bg_color ?? background;
  const bottomBar = theme.bottom_bar_bg_color ?? background;
  webApp.setHeaderColor?.(header);
  webApp.setBackgroundColor?.(background);
  webApp.setBottomBarColor?.(bottomBar);
  if (theme.bg_color) document.documentElement.style.setProperty("--tg-background", theme.bg_color);
  document.documentElement.style.setProperty("--tg-header-background", header);
  document.documentElement.style.setProperty("--tg-bottom-bar-background", bottomBar);
}

export function initTelegramBridge(options: { onBack?: () => void } = {}): TelegramWebAppLike | undefined {
  const webApp = getTelegramWebApp();
  if (!webApp) return undefined;
  webApp.ready?.();
  webApp.expand?.();
  if (supportsVersion(webApp, "8.0")) webApp.requestFullscreen?.();
  applyTelegramViewport(webApp);
  applyTelegramTheme(webApp);
  const onResize = () => applyTelegramViewport(webApp);
  const onThemeChange = () => applyTelegramTheme(webApp);
  window.addEventListener("resize", onResize, { passive: true });
  webApp.onEvent?.("viewportChanged", onResize);
  webApp.onEvent?.("themeChanged", onThemeChange);
  if (options.onBack && webApp.BackButton) { webApp.BackButton.onClick(options.onBack); webApp.BackButton.show(); }
  return webApp;
}

export function openTelegramLink(url: string): void {
  const webApp = getTelegramWebApp();
  if (webApp && "openTelegramLink" in webApp && typeof (webApp as TelegramWebAppLike & { openTelegramLink?: (value: string) => void }).openTelegramLink === "function") {
    (webApp as TelegramWebAppLike & { openTelegramLink: (value: string) => void }).openTelegramLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function secureStorage(): NonNullable<TelegramWebAppLike["SecureStorage"]> | undefined { return getTelegramWebApp()?.SecureStorage; }

export function secureStorageGet(key: string): Promise<string | undefined> {
  const storage = secureStorage();
  if (!storage) return Promise.resolve(undefined);
  return new Promise((resolve) => storage.getItem(key, (error, value) => resolve(error ? undefined : value)));
}

export function secureStorageSet(key: string, value: string): Promise<boolean> {
  const storage = secureStorage();
  if (!storage) return Promise.resolve(false);
  return new Promise((resolve) => storage.setItem(key, value, (error) => resolve(!error)));
}

export function authenticateBiometric(reason: string): Promise<boolean> {
  const biometric = getTelegramWebApp()?.BiometricManager;
  if (!biometric?.authenticate) return Promise.resolve(false);
  return new Promise((resolve) => {
    const run = () => biometric.authenticate({ reason }, (success) => resolve(success));
    if (biometric.isInited) run(); else biometric.init(run);
  });
}

export function configureTelegramButtons(options: { main?: { text: string; onClick: () => void }; secondary?: { text: string; onClick: () => void } }): () => void {
  const webApp = getTelegramWebApp();
  const main = webApp?.MainButton;
  const secondary = webApp?.SecondaryButton;
  if (main && options.main) { main.setText(options.main.text); main.enable(); main.onClick(options.main.onClick); main.show(); }
  if (secondary && options.secondary) { secondary.setText(options.secondary.text); secondary.enable(); secondary.onClick(options.secondary.onClick); secondary.show(); }
  return () => {
    if (main && options.main) { main.offClick(options.main.onClick); main.hide(); }
    if (secondary && options.secondary) { secondary.offClick(options.secondary.onClick); secondary.hide(); }
  };
}

export function hapticSelection(): void { getTelegramWebApp()?.HapticFeedback?.selectionChanged(); }
export function hapticImpact(style: "light" | "medium" | "heavy" = "medium"): void { getTelegramWebApp()?.HapticFeedback?.impactOccurred(style); }
export function hapticNotification(type: "error" | "success" | "warning"): void { getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type); }
