import { makePersisted } from "@solid-primitives/storage";
import { createResource, type Accessor } from "solid-js";
import type { SetStoreFunction, Store } from "solid-js/store";

import { usePlatform, type AsyncStorage, type SyncStorage } from "../context/platform";
import {
  Persist,
  LEGACY_STORAGE,
  localStorageWithPrefix,
  mergePersistedValue,
  parsePersistedValue,
  snapshot,
  type PersistTarget,
} from "./persist-core";

export { Persist, type PersistTarget } from "./persist-core";

type InitType = Promise<string> | string | null;
type PersistedWithReady<T> = [Store<T>, SetStoreFunction<T>, InitType, Accessor<boolean>];

export function persisted<T>(
  target: string | PersistTarget,
  store: [Store<T>, SetStoreFunction<T>],
): PersistedWithReady<T> {
  const platform = usePlatform();
  const config: PersistTarget = typeof target === "string" ? { key: target } : target;

  const defaults = snapshot(store[0]);
  const legacy = config.legacy ?? [];

  const isDesktop = platform.platform === "desktop" && !!platform.storage;

  const currentStorage = (() => {
    if (isDesktop) return platform.storage?.(config.storage);
    if (!config.storage) return localStorage;
    return localStorageWithPrefix(config.storage);
  })();

  const legacyStorage = (() => {
    if (!isDesktop) return localStorage;
    if (!config.storage) return platform.storage?.();
    return platform.storage?.(LEGACY_STORAGE);
  })();

  const storage = (() => {
    if (!isDesktop) {
      const current = currentStorage as SyncStorage;
      const legacyStore = legacyStorage as SyncStorage;

      const api: SyncStorage = {
        getItem: (key) => {
          const raw = current.getItem(key);
          if (raw !== null) {
            const parsed = parsePersistedValue(raw);
            if (parsed === undefined) return raw;

            const migrated = config.migrate ? config.migrate(parsed) : parsed;
            const merged = mergePersistedValue(defaults, migrated);
            const next = JSON.stringify(merged);
            if (raw !== next) current.setItem(key, next);
            return next;
          }

          for (const legacyKey of legacy) {
            const legacyRaw = legacyStore.getItem(legacyKey);
            if (legacyRaw === null) continue;

            current.setItem(key, legacyRaw);
            legacyStore.removeItem(legacyKey);

            const parsed = parsePersistedValue(legacyRaw);
            if (parsed === undefined) return legacyRaw;

            const migrated = config.migrate ? config.migrate(parsed) : parsed;
            const merged = mergePersistedValue(defaults, migrated);
            const next = JSON.stringify(merged);
            if (legacyRaw !== next) current.setItem(key, next);
            return next;
          }

          return null;
        },
        setItem: (key, value) => {
          current.setItem(key, value);
        },
        removeItem: (key) => {
          current.removeItem(key);
        },
      };

      return api;
    }

    const current = currentStorage as AsyncStorage;
    const legacyStore = legacyStorage as AsyncStorage | undefined;

    const api: AsyncStorage = {
      getItem: async (key) => {
        const raw = await current.getItem(key);
        if (raw !== null) {
          const parsed = parsePersistedValue(raw);
          if (parsed === undefined) return raw;

          const migrated = config.migrate ? config.migrate(parsed) : parsed;
          const merged = mergePersistedValue(defaults, migrated);
          const next = JSON.stringify(merged);
          if (raw !== next) await current.setItem(key, next);
          return next;
        }

        if (!legacyStore) return null;

        for (const legacyKey of legacy) {
          const legacyRaw = await legacyStore.getItem(legacyKey);
          if (legacyRaw === null) continue;

          await current.setItem(key, legacyRaw);
          await legacyStore.removeItem(legacyKey);

          const parsed = parsePersistedValue(legacyRaw);
          if (parsed === undefined) return legacyRaw;

          const migrated = config.migrate ? config.migrate(parsed) : parsed;
          const merged = mergePersistedValue(defaults, migrated);
          const next = JSON.stringify(merged);
          if (legacyRaw !== next) await current.setItem(key, next);
          return next;
        }

        return null;
      },
      setItem: async (key, value) => {
        await current.setItem(key, value);
      },
      removeItem: async (key) => {
        await current.removeItem(key);
      },
    };

    return api;
  })();

  const [state, setState, init] = makePersisted(store, { name: config.key, storage });

  const isAsync = init instanceof Promise;
  const [ready] = createResource(
    () => init,
    async (initValue) => {
      if (initValue instanceof Promise) await initValue;
      return true;
    },
    { initialValue: !isAsync },
  );

  return [state, setState, init, () => ready() === true];
}
