import type { ThemeMode } from "./types";

const THEME_CACHE_KEY = "worldCupCopilotTheme";

export function applyDocumentTheme(theme: ThemeMode): () => void {
  if (typeof document === "undefined") {
    cacheDocumentTheme(theme);
    return () => undefined;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.backgroundColor = themeBackground(theme);
  document.body.dataset.theme = theme;
  cacheDocumentTheme(theme);

  return () => {
    delete document.documentElement.dataset.theme;
    delete document.body.dataset.theme;
  };
}

export function getInitialDocumentTheme(): ThemeMode {
  if (typeof document === "undefined") return readCachedDocumentTheme() ?? "white";

  return normalizeThemeMode(
    document.documentElement.dataset.theme || readCachedDocumentTheme() || undefined
  );
}

export function cacheDocumentTheme(theme: ThemeMode): void {
  try {
    globalThis.localStorage?.setItem(THEME_CACHE_KEY, theme);
  } catch {
    // Local storage is a flash-prevention cache only. The source of truth is chrome.storage.
  }
}

export function readCachedDocumentTheme(): ThemeMode | undefined {
  try {
    return normalizeThemeMode(globalThis.localStorage?.getItem(THEME_CACHE_KEY) ?? undefined);
  } catch {
    return undefined;
  }
}

export function normalizeThemeMode(theme?: string): ThemeMode {
  if (theme === "black") return "black";
  if (theme === "yellow" || theme === "claude") return "yellow";
  return "white";
}

function themeBackground(theme: ThemeMode): string {
  if (theme === "black") return "#08090b";
  if (theme === "yellow") return "#f7f2e6";
  return "#f5f5f7";
}
