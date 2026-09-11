"use client";

import type { WeeklySummary } from "@/lib/api";
import { pickTemp, unitSymbol, type Unit } from "@/lib/format";

// Labels/colors match thermal-profile.json's idle / sustained_workload /
// heavy_gaming bands (see backend/app/main.py's TEMP_*_C thresholds).
// Tailwind needs full class-name literals to see them at build time, so
// these are spelled out per band rather than built with `bg-${tone}`.
const BANDS = [
  {
    key: "percent_in_low",
    label: "Low",
    text: "text-ok",
    bg: "bg-ok",
    border: "var(--ok)",
  },
  {
    key: "percent_in_medium",
    label: "Medium",
    text: "text-warn",
    bg: "bg-warn",
    border: "var(--warn)",
  },
  {
    key: "percent_in_high",
    label: "High",
    text: "text-bad",
    bg: "bg-bad",
    border: "var(--bad)",
  },
] as const;

export function WeeklySummaryView({
  summary,
  unit,
  noData,
}: {
  summary: WeeklySummary | undefined;
  unit: Unit;
  noData: boolean;
}) {
  if (noData) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No readings in the past 7 days yet.
      </p>
    );
  }

  const avgTemp = summary ? pickTemp(summary.avg_temp_c, summary.avg_temp_f, unit) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="text-sm text-muted">Average temperature</div>
        <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
          {avgTemp == null ? "–" : `${avgTemp.toFixed(1)}${unitSymbol(unit)}`}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm text-muted">Time spent in each band</div>

        {/* stacked bar: low/medium/high segments sized by their share of readings */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
          {BANDS.map(({ key, bg }) => {
            const pct = summary?.[key] ?? 0;
            return pct > 0 ? (
              <div key={key} className={`h-full ${bg}`} style={{ width: `${pct}%` }} />
            ) : null;
          })}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {BANDS.map(({ key, label, text, bg, border }) => (
            <div
              key={key}
              className="rounded-lg border border-border bg-surface-2 p-3"
              style={{ borderLeft: `3px solid ${border}` }}
            >
              <div className={`flex items-center gap-1.5 text-xs font-medium ${text}`}>
                <span className={`h-2 w-2 rounded-full ${bg}`} />
                {label}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {summary ? `${summary[key].toFixed(1)}%` : "–"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted">
        {summary ? `Based on ${summary.readings.toLocaleString()} readings` : "Loading…"}
      </p>
    </div>
  );
}
