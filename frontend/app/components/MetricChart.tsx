"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisTick, fullStamp } from "@/lib/format";
import type { LevelId } from "@/lib/zoom";

export interface ChartPoint {
  t: number; // epoch ms (bucket start, or reading time at raw level)
  avg: number | null;
  band: [number, number] | null; // [min, max] within the bucket
  count: number;
}

interface Props {
  title: string;
  icon: React.ReactNode;
  data: ChartPoint[];
  domain: [number, number];
  levelId: LevelId;
  color: string; // CSS var reference, e.g. "var(--temp)"
  unitSuffix: string; // "°C" | "%"
  digits: number;
  canDrill: boolean;
  onDrill: (t: number) => void;
  loading: boolean;
}

export function MetricChart({
  title,
  icon,
  data,
  domain,
  levelId,
  color,
  unitSuffix,
  digits,
  canDrill,
  onDrill,
  loading,
}: Props) {
  const hasData = data.some((d) => d.avg != null);
  const showDots = data.length <= 40;

  // Evenly spaced ticks across the *window* (not just where data happens to
  // be) so a sparse day still reads as a day.
  const ticks = useMemo(() => {
    const [a, b] = domain;
    const n = 6;
    return Array.from({ length: n + 1 }, (_, i) => Math.round(a + ((b - a) * i) / n));
  }, [domain]);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted">
        {icon}
        {title}
        {loading && (
          <span className="ml-auto text-xs font-normal text-muted">updating…</span>
        )}
      </div>

      <div
        className="h-56 w-full"
        style={{ cursor: canDrill && hasData ? "pointer" : "default" }}
      >
        {!hasData && !loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            No readings in this range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 6, right: 8, bottom: 2, left: -12 }}
              onClick={(state: { activeLabel?: string | number }) => {
                const t = state?.activeLabel;
                if (canDrill && t != null) onDrill(Number(t));
              }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={domain}
                ticks={ticks}
                interval={0}
                allowDataOverflow
                tickFormatter={(t) => axisTick(Number(t), levelId)}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                stroke="var(--border)"
                minTickGap={8}
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                stroke="var(--border)"
                width={48}
                domain={[
                  (min: number) => Math.floor(min - 1),
                  (max: number) => Math.ceil(max + 1),
                ]}
                tickFormatter={(v) => `${v}${unitSuffix}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as ChartPoint;
                  return (
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                      <div className="mb-1 font-medium text-text">
                        {fullStamp(p.t, levelId === "ten_min")}
                      </div>
                      <div className="text-muted">
                        avg{" "}
                        <span className="font-mono text-text">
                          {p.avg?.toFixed(digits) ?? "–"}
                          {unitSuffix}
                        </span>
                      </div>
                      {p.band && p.band[0] !== p.band[1] && (
                        <div className="text-muted">
                          range{" "}
                          <span className="font-mono text-text">
                            {p.band[0].toFixed(digits)}–{p.band[1].toFixed(digits)}
                            {unitSuffix}
                          </span>
                        </div>
                      )}
                      <div className="text-muted">
                        {p.count} reading{p.count === 1 ? "" : "s"}
                        {canDrill && " · click to zoom in"}
                      </div>
                    </div>
                  );
                }}
              />
              {/* min/max spread for the bucket */}
              <Area
                dataKey="band"
                stroke="none"
                fill={color}
                fillOpacity={0.14}
                isAnimationActive={false}
                connectNulls
              />
              {/* bucket average */}
              <Line
                dataKey="avg"
                stroke={color}
                strokeWidth={2}
                dot={showDots ? { r: 2.5, fill: color } : false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
