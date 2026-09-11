"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import NumberFlow from "@number-flow/react";
import { ChevronRight, Droplets, Thermometer } from "lucide-react";
import { fetcher, qs, type Health, type Reading, type WeeklySummary } from "@/lib/api";
import { ago, pickTemp, unitSymbol, type Unit } from "@/lib/format";
import { ConnectionBadge } from "./ConnectionBadge";
import { WeeklySummaryView } from "./WeeklySummaryView";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Milliseconds from `from` until the viewer's next local midnight.
function msUntilNextMidnight(from: number): number {
  const next = new Date(from);
  next.setHours(24, 0, 0, 0); // rolls over to midnight of the following day
  return next.getTime() - from;
}

type View = "live" | "summary";

export function LiveReading({ unit }: { unit: Unit }) {
  const [view, setView] = useState<View>("live");

  const { data: reading, error: readingError } = useSWR<Reading>(
    "/readings/latest",
    fetcher,
    { refreshInterval: 5000, keepPreviousData: true },
  );
  const { data: health, error: healthError } = useSWR<Health>(
    "/health",
    fetcher,
    { refreshInterval: 10000, keepPreviousData: true },
  );

  // Re-render once a second so the "12s ago" freshness label keeps ticking.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Recomputed only at local midnight, not on every render.
  const [summaryWindowEnd, setSummaryWindowEnd] = useState(() => Date.now());
  useEffect(() => {
    const id = setTimeout(
      () => setSummaryWindowEnd(Date.now()),
      msUntilNextMidnight(summaryWindowEnd),
    );
    return () => clearTimeout(id);
  }, [summaryWindowEnd]);

  const { data: summary, error: summaryError } = useSWR<WeeklySummary>(
    view === "summary"
      ? `/readings/weekly_summary${qs({
          start: new Date(summaryWindowEnd - WEEK_MS).toISOString(),
          end: new Date(summaryWindowEnd).toISOString(),
        })}`
      : null,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const temp = reading ? pickTemp(reading.temp_c, reading.temp_f, unit) : null;
  const humidity = reading?.humidity ?? null;
  const noReadingData = readingError && !reading;
  const noSummaryData = summaryError && !summary;

  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView((v) => (v === "live" ? "summary" : "live"))}
            aria-label={view === "live" ? "Show past 7 days" : "Show live reading"}
            title={view === "live" ? "Show past 7 days" : "Show live reading"}
            className="rounded-md p-0.5 text-muted transition hover:bg-primary-soft/50 hover:text-primary active:scale-95"
          >
            <ChevronRight
              size={16}
              className={`transition-transform ${view === "summary" ? "rotate-180" : ""}`}
            />
          </button>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <span className="h-3 w-1 rounded-full bg-primary" />
            {view === "live" ? "Now" : "Past 7 Days"}
          </h2>
        </div>
        <ConnectionBadge health={health} error={healthError} />
      </div>

      {view === "live" ? (
        noReadingData ? (
          <p className="py-8 text-center text-sm text-muted">
            No readings yet — is the backend running and the sensor plugged in?
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Stat
              icon={<Thermometer className="text-temp" size={20} />}
              label="Temperature"
              value={temp}
              suffix={unitSymbol(unit)}
              digits={1}
              accent="var(--temp)"
            />
            <Stat
              icon={<Droplets className="text-humidity" size={20} />}
              label="Humidity"
              value={humidity}
              suffix="%"
              digits={0}
              accent="var(--humidity)"
            />
          </div>
        )
      ) : (
        <WeeklySummaryView summary={summary} unit={unit} noData={noSummaryData} />
      )}

      {view === "live" && (
        <p className="mt-4 text-xs text-muted">
          {reading
            ? `Updated ${ago(reading.ts)}`
            : health?.last_reading_ts
              ? `Last reading ${ago(health.last_reading_ts)}`
              : "Waiting for first reading…"}
        </p>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  suffix,
  digits,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  suffix: string;
  digits: number;
  accent: string;
}) {
  return (
    <div
      className="group relative isolate overflow-hidden rounded-xl border border-border bg-surface-2 p-4"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      {/* accent bloom in the corner — sits behind the text (-z-10) */}
      <div
        className="pointer-events-none absolute -right-8 -top-10 -z-10 h-24 w-24 rounded-full opacity-15 blur-2xl transition-opacity duration-300 group-hover:opacity-30"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-2 text-sm text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
        {value == null ? (
          "–"
        ) : (
          <NumberFlow
            value={value}
            format={{
              minimumFractionDigits: digits,
              maximumFractionDigits: digits,
            }}
            suffix={suffix}
          />
        )}
      </div>
    </div>
  );
}
