export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
}

const CACHE_PREFIX = "worldCupCopilotCache:";
const memoryCache = new Map<string, CacheEntry<unknown>>();

export async function readCache<T>(key: string, options: { allowExpired?: boolean } = {}): Promise<T | undefined> {
  const entry = await readCacheEntry<T>(key);
  if (!entry) return undefined;
  if (!options.allowExpired && entry.expiresAt <= Date.now()) return undefined;
  return entry.value;
}

export async function writeCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const now = Date.now();
  const entry: CacheEntry<T> = {
    value,
    createdAt: now,
    expiresAt: now + ttlMs
  };

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [storageKey(key)]: entry });
    return;
  }

  if (globalThis.localStorage) {
    globalThis.localStorage.setItem(storageKey(key), JSON.stringify(entry));
    return;
  }

  memoryCache.set(storageKey(key), entry);
}

export async function clearCache(): Promise<void> {
  memoryCache.clear();
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const values = await chrome.storage.local.get(null);
    const keys = Object.keys(values).filter((key) => key.startsWith(CACHE_PREFIX));
    if (keys.length) await chrome.storage.local.remove(keys);
    return;
  }

  if (globalThis.localStorage) {
    Object.keys(globalThis.localStorage)
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .forEach((key) => globalThis.localStorage.removeItem(key));
  }
}

async function readCacheEntry<T>(key: string): Promise<CacheEntry<T> | undefined> {
  const fullKey = storageKey(key);

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const result = await chrome.storage.local.get(fullKey);
    return result[fullKey] as CacheEntry<T> | undefined;
  }

  const raw = globalThis.localStorage?.getItem(fullKey);
  if (raw) {
    try {
      return JSON.parse(raw) as CacheEntry<T>;
    } catch {
      return undefined;
    }
  }

  return memoryCache.get(fullKey) as CacheEntry<T> | undefined;
}

function storageKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}
