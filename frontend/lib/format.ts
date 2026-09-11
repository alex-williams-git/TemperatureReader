import type { WindowLevelId } from "./zoom";

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

// ---- time (all rendered in the viewer's local zone) ----------------------

const time = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dayShort = (t: number) =>
  new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

// X-axis tick label, tuned per zoom window level.
export function axisTick(t: number, windowLevel: WindowLevelId): string {
  switch (windowLevel) {
    case "week":
      return new Date(t).toLocaleDateString([], { weekday: "short", day: "numeric" });
    case "day":
      return time(t);
    case "hour":
    case "ten_min":
      return time(t);
  }
}

// Full timestamp for tooltips. `withSeconds` at the raw zoom level.
export function fullStamp(t: number, withSeconds = false): string {
  return `${dayShort(t)} · ${new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  })}`;
}

// Breadcrumb label for a window's starting instant.
export function crumbLabel(windowLevelId: WindowLevelId, start: number): string {
  switch (windowLevelId) {
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

// "12s ago", "3m ago", "1h ago" — for the live reading's freshness.
export function ago(iso: string | null): string {
  if (!iso) return "never";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${Math.round(secs)}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

// General utility to sanitize the tickSeconds input from the user. 
export function getTickSeconds(tickSeconds: number): string {
    if (Number.isNaN(tickSeconds)) return "60"; // Default to 60 seconds if input is not a number
    if (tickSeconds < 5) return "5"; // Minimum tick is 5 seconds. Anything below 0 would break.
    if (tickSeconds > 60) return "60"; // Maximum tick is 60 seconds

    return tickSeconds.toString();
}