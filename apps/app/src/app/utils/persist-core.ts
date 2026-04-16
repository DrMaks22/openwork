import type { AsyncStorage, SyncStorage } from "../context/platform";

export type PersistTarget = {
  storage?: string;
  key: string;
  legacy?: string[];
  migrate?: (value: unknown) => unknown;
};

export const LEGACY_STORAGE = "default.dat";
export const GLOBAL_STORAGE = "openwork.global.dat";

export function snapshot(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergePersistedValue(defaults: unknown, value: unknown): unknown {
  if (value === undefined) return defaults;
  if (value === null) return value;

  if (Array.isArray(defaults)) {
    if (Array.isArray(value)) return value;
    return defaults;
  }

  if (isRecord(defaults)) {
    if (!isRecord(value)) return defaults;

    const result: Record<string, unknown> = { ...defaults };
    for (const key of Object.keys(value)) {
      if (key in defaults) {
        result[key] = mergePersistedValue(
          (defaults as Record<string, unknown>)[key],
          (value as Record<string, unknown>)[key],
        );
      } else {
        result[key] = (value as Record<string, unknown>)[key];
      }
    }
    return result;
  }

  return value;
}

export function parsePersistedValue(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function storageChecksum(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function workspaceStorageName(dir: string) {
  const head = dir.slice(0, 12) || "workspace";
  const sum = storageChecksum(dir);
  return `openwork.workspace.${head}.${sum}.dat`;
}

export function localStorageWithPrefix(prefix: string): SyncStorage {
  const base = `${prefix}:`;
  return {
    getItem: (key) => localStorage.getItem(base + key),
    setItem: (key, value) => localStorage.setItem(base + key, value),
    removeItem: (key) => localStorage.removeItem(base + key),
  };
}

export const Persist = {
  global(key: string, legacy?: string[]): PersistTarget {
    return { storage: GLOBAL_STORAGE, key, legacy };
  },
  workspace(dir: string, key: string, legacy?: string[]): PersistTarget {
    return { storage: workspaceStorageName(dir), key: `workspace:${key}`, legacy };
  },
  session(dir: string, session: string, key: string, legacy?: string[]): PersistTarget {
    return { storage: workspaceStorageName(dir), key: `session:${session}:${key}`, legacy };
  },
  scoped(dir: string, session: string | undefined, key: string, legacy?: string[]): PersistTarget {
    if (session) return Persist.session(dir, session, key, legacy);
    return Persist.workspace(dir, key, legacy);
  },
};

export type PersistStorage = SyncStorage | AsyncStorage;
