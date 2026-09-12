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
import type { WindowLevelId } from "@/lib/zoom";

export interface ChartPoint {
  t: number; // epoch ms (bucket start, or reading time at raw level)
  avg: number | null;
  band: [number, number] | null; // [min, max] within the bucket
  count: number;
  anchor?: boolean; // synthetic point that stretches the curve to the window/live edge
}

interface Props {
  title: string;
  icon: React.ReactNode;
  data: ChartPoint[];
  domain: [number, number];
  windowLevelId: WindowLevelId;
  color: string; // CSS var reference, e.g. "var(--temp)"
  unitSuffix: string; // "°C" | "%"
  digits: number;
  canDrill: boolean;
  onDrill: (t: number) => void;
  loading: boolean;
  live: boolean; // window still contains "now" — breathe the head-of-line dot
}

export function MetricChart({
  title,
  icon,
  data,
  domain,
  windowLevelId,
  color,
  unitSuffix,
  digits,
  canDrill,
  onDrill,
  loading,
  live,
}: Props) {
  const hasData = data.some((d) => d.avg != null);
  const showDots = data.length <= 40;

  // Last real (non-anchor, non-null) point — where the "still live" dot goes.
  const lastLiveIndex = useMemo(() => {
    if (!live) return -1;
    for (let i = data.length - 1; i >= 0; i--) {
      if (!data[i].anchor && data[i].avg != null) return i;
    }
    return -1;
  }, [live, data]);

  // Skip markers on the synthetic anchor point (and, for resting dots, on gaps).
  // The live head always gets a dot even when resting dots are otherwise hidden.
  type DotArgs = { cx?: number; cy?: number; index?: number; payload?: ChartPoint };
  const renderDot = ({ cx, cy, index, payload }: DotArgs) => {
    const key = `dot-${index}`;
    if (cx == null || cy == null || payload?.anchor || payload?.avg == null) {
      return <g key={key} />;
    }
    if (index === lastLiveIndex) {
      return <LiveDot key={key} cx={cx} cy={cy} color={color} />;
    }
    if (!showDots) return <g key={key} />;
    return <circle key={key} cx={cx} cy={cy} r={2.5} fill={color} />;
  };
  const renderActiveDot = ({ cx, cy, index, payload }: DotArgs) => {
    const key = `adot-${index}`;
    if (cx == null || cy == null || payload?.anchor) return <g key={key} />;
    return (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={4}
        fill={color}
        stroke="var(--surface)"
        strokeWidth={2}
      />
    );
  };

  // Evenly spaced ticks across the *window* (not just where data happens to
  // be) so a sparse day still reads as a day.
  const ticks = useMemo(() => {
    const [a, b] = domain;
    const n = 6;
    return Array.from({ length: n + 1 }, (_, i) => Math.round(a + ((b - a) * i) / n));
  }, [domain]);

  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-4">
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
                if (!canDrill || t == null) return;
                // Clicks that resolve to a synthetic anchor point do nothing.
                if (data.find((d) => d.t === Number(t))?.anchor) return;
                onDrill(Number(t));
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
                tickFormatter={(t) => axisTick(Number(t), windowLevelId)}
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
                  if (p.anchor) return null;
                  return (
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                      <div className="mb-1 font-medium text-text">
                        {fullStamp(p.t, windowLevelId === "ten_min")}
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
                type="monotone"
                stroke="none"
                fill={color}
                fillOpacity={0.14}
                isAnimationActive={false}
                connectNulls
              />
              {/* bucket average */}
              <Line
                dataKey="avg"
                type="monotone"
                stroke={color}
                strokeWidth={2}
                dot={renderDot}
                activeDot={renderActiveDot}
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

// A breathing dot at the live edge of the chart — a solid center with a
// pulsing ring, echoing the "sensor live" indicator in ConnectionBadge but
// drawn in SVG so it tracks the chart's own coordinates.
function LiveDot({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={color} className="chart-live-dot__ring" />
      <circle cx={cx} cy={cy} r={3} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
    </g>
  );
}
