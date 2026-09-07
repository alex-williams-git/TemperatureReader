import type { LevelId } from "./zoom";

export type Unit = "c" | "f";

export const unitSymbol = (u: Unit) => (u === "c" ? "°C" : "°F");

export function pickTemp(
  c: number | null | undefined,
  f: number | null | undefined,
  unit: Unit,
): number | null {
  const v = unit === "c" ? c : f;
  return v == null || Number.isNaN(v) ? null : v;
}

export function fmtTemp(v: number | null, unit: Unit, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "–";
  return `${v.toFixed(digits)}${unitSymbol(unit)}`;
}

export function fmtPercent(v: number | null, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "–";
  return `${v.toFixed(digits)}%`;
}

// ---- time (all rendered in the viewer's local zone) ----------------------

const time = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dayShort = (t: number) =>
  new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

/** X-axis tick label, tuned per zoom level. */
export function axisTick(t: number, level: LevelId): string {
  switch (level) {
    case "week":
      return new Date(t).toLocaleDateString([], { weekday: "short", day: "numeric" });
    case "day":
      return time(t);
    case "hour":
    case "ten_min":
      return time(t);
  }
}

/** Full timestamp for tooltips. `withSeconds` at the raw zoom level. */
export function fullStamp(t: number, withSeconds = false): string {
  return `${dayShort(t)} · ${new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  })}`;
}

/** Breadcrumb label for a frame's starting instant. */
export function crumbLabel(levelId: LevelId, start: number): string {
  switch (levelId) {
    case "week":
      return "Past 7 days";
    case "day":
      return dayShort(start);
    case "hour":
      return `${dayShort(start)}, ${time(start)}`;
    case "ten_min":
      return `${dayShort(start)}, ${time(start)}`;
  }
}

/** "12s ago", "3m ago", "1h ago" — for the live reading's freshness. */
export function ago(iso: string | null): string {
  if (!iso) return "never";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${Math.round(secs)}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}
