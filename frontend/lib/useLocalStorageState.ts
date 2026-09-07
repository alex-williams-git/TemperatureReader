"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * useState-like API backed by localStorage, implemented as an external store
 * (which is exactly what localStorage is). getServerSnapshot returns the
 * fallback, so SSR and the first client render agree; the real value arrives
 * on the first commit without a hydration mismatch. Also syncs across tabs via
 * the `storage` event.
 */
export function useLocalStorageState<T>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  // Cache the parsed value against its raw string so getSnapshot returns a
  // stable reference between renders (useSyncExternalStore compares with Object.is).
  const cache = useRef<{ raw: string | null; value: T }>({
    raw: null,
    value: fallback,
  });

  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  const getSnapshot = useCallback((): T => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      /* storage blocked — fall through to fallback */
    }
    if (raw !== cache.current.raw) {
      cache.current = {
        raw,
        value: raw != null ? safeParse(raw, fallback) : fallback,
      };
    }
    return cache.current.value;
  }, [key, fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);

  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      // `storage` only fires in *other* tabs — dispatch so this tab updates too.
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    [key],
  );

  return [value, setValue];
}
