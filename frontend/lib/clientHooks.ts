"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

// True once mounted on the client; false during SSR and the first render.
// Uses an external store rather than an effect, so it's lint-clean and
// can't cause a cascading re-render.
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

// A coarse "now", quantized to `stepMs` and refreshed on that interval.
// Quantizing keeps the snapshot stable (Object.is) between ticks. Returns 0
// on the server.
export function useNow(stepMs = 30_000): number {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, stepMs);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / stepMs) * stepMs,
    () => 0,
  );
}
