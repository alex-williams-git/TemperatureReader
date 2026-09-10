"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Droplets,
  RotateCcw,
  Thermometer,
} from "lucide-react";
import { fetcher, qs, type AggregateBucket, type Reading } from "@/lib/api";
import {
  bucketStartMs,
  drillInto,
  initialFrame,
  isLive,
  LEVELS,
  pan,
  ROOT_LEVEL,
  TAIL_BUCKET,
  tzOffsetMinutes,
  type Frame,
} from "@/lib/zoom";
import { crumbLabel, pickTemp, unitSymbol, type Unit } from "@/lib/format";
import { useNow } from "@/lib/clientHooks";
import { MetricChart, type ChartPoint } from "./MetricChart";

/** One aggregate bucket → a temp point and a humidity point. */
function bucketToPoints(b: AggregateBucket, unit: Unit) {
  const t = new Date(b.bucket_start).getTime();
  const avg = unit === "c" ? b.temp_c_avg : b.temp_f_avg;
  const lo = unit === "c" ? b.temp_c_min : b.temp_f_min;
  const hi = unit === "c" ? b.temp_c_max : b.temp_f_max;
  return {
    temp: { t, avg, band: [lo, hi] as [number, number], count: b.count },
    hum: {
      t,
      avg: b.humidity_avg,
      band: [b.humidity_min, b.humidity_max] as [number, number],
      count: b.count,
    },
  };
}

export function HistoryChart({ unit }: { unit: Unit }) {
  // The drill/pan stack. Empty = the live view. Every entry here is a *frozen*
  // window; only the live view (below) follows the clock.
  const [frames, setFrames] = useState<Frame[]>([]);

  // Recomputed each minute so the live window's `end` keeps up with "now"
  // Otherwise, today's in-progress day-bucket never enters the query window until reload
  const now = useNow(60_000);
  const liveFrame = useMemo(() => initialFrame(now), [now]);

  const frame = frames.length ? frames[frames.length - 1] : liveFrame;
  const level = LEVELS[frame.levelId];
  const canDrill = level.childId != null;

  // Breadcrumb trail. While drilled in but not panned at the root, frames[0] is a child level and the true root is the live view, so we prepend
  // root is explicit is true when the root week is a stored frame when panned
  // Frames is the source of truth and collection of all drilled in frames. Crumbs is just a view of frames for rendering
  const rootIsExplicit = frames.length > 0 && frames[0].levelId === ROOT_LEVEL;
  const crumbs = rootIsExplicit ? frames : [liveFrame, ...frames];

  const startIso = new Date(frame.start).toISOString();
  const endIso = new Date(frame.end).toISOString();
  const raw = level.bucket === "raw";
  // Width of one aggregate bucket (a level's child span == its bucket size);
  // 0 at the raw level. Used to stretch the last bucket to the window edge.
  const bucketMs = level.childId ? LEVELS[level.childId].spanMs : 0;

  const key = raw
    ? `/readings/range${qs({ start: startIso, end: endIso, limit: 5000 })}`
    : `/readings/aggregate${qs({
        start: startIso,
        end: endIso,
        bucket: level.bucket,
        tz_offset_minutes: tzOffsetMinutes(),
      })}`;

  const { data, error, isLoading } = useSWR<Reading[] | AggregateBucket[]>(
    key,
    fetcher,
    { refreshInterval: isLive(frame, now) ? 20_000 : 0, keepPreviousData: true },
  );

  // If the window still contains "now", its newest top-level bucket is only
  // half-full. Re-query just that bucket at a finer size and splice it in, so
  // the current period shows live movement instead of one flat slab.
  const tail = TAIL_BUCKET[frame.levelId];
  const curBucketStart =
    !raw && tail && frame.start <= now && now <= frame.end
      ? bucketStartMs(now, bucketMs, tzOffsetMinutes())
      : 0;
  const wantTail = curBucketStart >= frame.start && curBucketStart > 0;

  const { data: tailData } = useSWR<AggregateBucket[]>(
    wantTail
      ? `/readings/aggregate${qs({
          start: new Date(curBucketStart).toISOString(),
          end: endIso,
          bucket: tail!.param,
          tz_offset_minutes: tzOffsetMinutes(),
        })}`
      : null,
    fetcher,
    { refreshInterval: 20_000, keepPreviousData: true },
  );

  const { tempPoints, humPoints } = useMemo(() => {
    const temp: ChartPoint[] = [];
    const hum: ChartPoint[] = [];
    if (!data) return { tempPoints: temp, humPoints: hum };

    if (raw) {
      for (const r of data as Reading[]) {
        const t = new Date(r.ts).getTime();
        const tv = pickTemp(r.temp_c, r.temp_f, unit)!;
        temp.push({ t, avg: tv, band: [tv, tv], count: 1 });
        hum.push({ t, avg: r.humidity, band: [r.humidity, r.humidity], count: 1 });
      }
      return { tempPoints: temp, humPoints: hum };
    }

    for (const b of data as AggregateBucket[]) {
      const p = bucketToPoints(b, unit);
      temp.push(p.temp);
      hum.push(p.hum);
    }

    const tailPts = wantTail && tailData ? tailData.map((b) => bucketToPoints(b, unit)) : [];
    if (tailPts.length) {
      // Swap the coarse in-progress bucket for the finer tail, then pull the
      // curve out to "now" (the live edge). `anchor` points are synthetic:
      // no dot, no tooltip, not clickable.
      while (temp.length && temp[temp.length - 1].t >= curBucketStart) {
        temp.pop();
        hum.pop();
      }
      for (const p of tailPts) {
        temp.push(p.temp);
        hum.push(p.hum);
      }
      const lt = temp[temp.length - 1];
      const lh = hum[hum.length - 1];
      if (lt && lt.t < now) {
        temp.push({ ...lt, t: now, anchor: true });
        hum.push({ ...lh, t: now, anchor: true });
      }
    } else if (!wantTail && bucketMs && temp.length) {
      // Historical window: extend the last bucket across its slot so the curve
      // reaches the window edge. (A live window instead grows its finer tail.)
      const lt = temp[temp.length - 1];
      const lh = hum[hum.length - 1];
      temp.push({ ...lt, t: lt.t + bucketMs, anchor: true });
      hum.push({ ...lh, t: lh.t + bucketMs, anchor: true });
    }
    return { tempPoints: temp, humPoints: hum };
  }, [data, tailData, raw, bucketMs, wantTail, curBucketStart, now, unit]);

  const domain: [number, number] = [frame.start, frame.end];

  function drill(t: number) {
    const child = drillInto(frame, t, tzOffsetMinutes());
    if (child) setFrames((f) => [...f, child]);
  }
  // i indexes crumbs, which may lead with the live root.
  function jumpToCrumb(i: number) {
    if (rootIsExplicit) setFrames((f) => f.slice(0, i + 1));
    else if (i === 0) setFrames([]); // back to the week level view
    else setFrames((f) => f.slice(0, i)); // crumbs[i] === frames[i - 1]
  }
  function popLevel() {
    setFrames((f) => f.slice(0, -1));
  }
  function shift(direction: -1 | 1) {
    setFrames((f) => [...f.slice(0, -1), pan(frame, direction)]);
  }

  const atNow = frame.end >= now;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-sm font-semibold uppercase tracking-wide text-muted">
          History
        </h2>

        {/* breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((f, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={14} className="text-muted" />}
                <button
                  type="button"
                  onClick={() => jumpToCrumb(i)}
                  disabled={last}
                  className={
                    last
                      ? "rounded-md bg-primary-soft px-2 py-0.5 font-medium text-primary"
                      : "rounded-md px-2 py-0.5 text-muted hover:text-primary"
                  }
                >
                  {LEVELS[f.levelId].label}
                  <span className="ml-1.5 hidden text-xs opacity-70 sm:inline">
                    {crumbLabel(f.levelId, f.start)}
                  </span>
                </button>
              </span>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <IconBtn label="Earlier" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </IconBtn>
          <IconBtn label="Later" onClick={() => shift(1)} disabled={atNow}>
            <ChevronRight size={16} />
          </IconBtn>
          {crumbs.length > 1 && (
            <IconBtn label="Back out one level" onClick={popLevel}>
              <ArrowLeft size={16} />
            </IconBtn>
          )}
          <IconBtn
            label="Reset to the last 7 days"
            onClick={() => setFrames([])}
          >
            <RotateCcw size={16} />
          </IconBtn>
        </div>
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-bad">
          Couldn&apos;t load history — {String(error)}
        </p>
      ) : (
        <div className="grid gap-4">
          <MetricChart
            title={`Temperature (${unitSymbol(unit)})`}
            icon={<Thermometer size={16} className="text-temp" />}
            data={tempPoints}
            domain={domain}
            levelId={frame.levelId}
            color="var(--temp)"
            unitSuffix={unitSymbol(unit)}
            digits={1}
            canDrill={canDrill}
            onDrill={drill}
            loading={isLoading}
          />
          <MetricChart
            title="Humidity (%)"
            icon={<Droplets size={16} className="text-humidity" />}
            data={humPoints}
            domain={domain}
            levelId={frame.levelId}
            color="var(--humidity)"
            unitSuffix="%"
            digits={0}
            canDrill={canDrill}
            onDrill={drill}
            loading={isLoading}
          />
        </div>
      )}

      <p className="mt-3 text-xs text-muted">
        {canDrill
          ? "Click a point to zoom in · shaded band shows the min–max spread in each bucket"
          : "Raw readings · use ‹ › to step through 10-minute windows"}
      </p>
    </section>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-primary hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
