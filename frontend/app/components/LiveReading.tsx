"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import NumberFlow from "@number-flow/react";
import { Droplets, Thermometer } from "lucide-react";
import { fetcher, type Health, type Reading } from "@/lib/api";
import { ago, pickTemp, unitSymbol, type Unit } from "@/lib/format";
import { ConnectionBadge } from "./ConnectionBadge";

export function LiveReading({ unit }: { unit: Unit }) {
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

  const temp = reading ? pickTemp(reading.temp_c, reading.temp_f, unit) : null;
  const humidity = reading?.humidity ?? null;
  const noData = readingError && !reading;

  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <span className="h-3 w-1 rounded-full bg-primary" />
          Now
        </h2>
        <ConnectionBadge health={health} error={healthError} />
      </div>

      {noData ? (
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
      )}

      <p className="mt-4 text-xs text-muted">
        {reading
          ? `Updated ${ago(reading.ts)}`
          : health?.last_reading_ts
            ? `Last reading ${ago(health.last_reading_ts)}`
            : "Waiting for first reading…"}
      </p>
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
      className="group relative overflow-hidden rounded-xl border border-border bg-surface-2 p-4"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      {/* accent bloom that lifts on hover */}
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-15 blur-2xl transition-opacity duration-300 group-hover:opacity-30"
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
