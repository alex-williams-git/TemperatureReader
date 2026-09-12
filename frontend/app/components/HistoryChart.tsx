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
  getBucketStartTimeInMs,
  drillInto,
  getLiveWindow,
  isLive,
  WINDOW_LEVELS,
  pan,
  ROOT_WINDOW_LEVEL,
  TAIL_BUCKET,
  tzOffsetMinutes,
  type TimeWindow,
} from "@/lib/zoom";
import { crumbLabel, pickTemp, unitSymbol, type Unit } from "@/lib/format";
import { useNow } from "@/lib/clientHooks";
import { MetricChart, type ChartPoint } from "./MetricChart";

// One aggregate bucket → a temp point and a humidity point.
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

export function HistoryChart({ unit, tickSeconds }: { unit: Unit; tickSeconds: number }) {
  // The drill/pan stack. Empty = the live view.
  // Entries are frozen windows unless live, in which case they re-resolve against the clock each tick.
  const [windows, setWindows] = useState<TimeWindow[]>([]);

  // Recomputed each minute so the live window's "end" keeps up with "now"
  // Base window is always at the week window level
  const now = useNow(tickSeconds * 1000);
  const rootWindow = useMemo(() => getLiveWindow(ROOT_WINDOW_LEVEL, now, tzOffsetMinutes(), false), [now]);

  // Top window is the window currently being viewed
  const topWindow = windows.length ? windows[windows.length - 1] : null;

  const isLiveShift = topWindow != null && now >= topWindow.end;
  const liveTopWindow = topWindow?.live ? getLiveWindow(topWindow.windowLevelId, now, tzOffsetMinutes(), isLiveShift) : null;
  const curWindow = liveTopWindow ?? topWindow ?? rootWindow;

  const windowLevel = WINDOW_LEVELS[curWindow.windowLevelId];
  const canDrill = windowLevel.childId != null;

  // Breadcrumb trail. While drilled in but not panned at the root, windows[0] is a child window level and the true root is the live view, so we prepend
  // rootIsExplicit tells us if the bottom of the stack is already a week window. If not, we need to append after the root window
  const rootIsExplicit = windows.length > 0 && windows[0].windowLevelId === ROOT_WINDOW_LEVEL;
  const baseCrumbs = rootIsExplicit ? windows : [rootWindow, ...windows];
  // Swap the last crumb for its clock-resolved window so its label isn't stale.
  const crumbs = liveTopWindow
    ? baseCrumbs.map((c, i) => (i === baseCrumbs.length - 1 ? liveTopWindow : c))
    : baseCrumbs;

  const startIso = new Date(curWindow.start).toISOString();
  const endIso = new Date(curWindow.end).toISOString();
  const raw = windowLevel.bucket === "raw";
  // Width of one aggregate bucket (a window level's child span == its bucket size);
  // 0 at the raw window level. Used to stretch the last bucket to the window edge.
  const bucketMs = windowLevel.childId ? WINDOW_LEVELS[windowLevel.childId].windowSpanMs : 0;

  const key = raw
    ? `/readings/range${qs({ start: startIso, end: endIso, limit: 5000 })}`
    : `/readings/aggregate${qs({
        start: startIso,
        end: endIso,
        bucket: windowLevel.bucket,
        tz_offset_minutes: tzOffsetMinutes(),
      })}`;

  const live = isLive(curWindow, now);

  const { data, error, isLoading } = useSWR<Reading[] | AggregateBucket[]>(
    key,
    fetcher,
    { refreshInterval: live ? 20_000 : 0, keepPreviousData: true },
  );

  // If the window still contains "now", its newest top-level bucket is only
  // half-full. Re-query just that bucket at a finer size and splice it in, so
  // the current period shows live movement instead of one flat slab.
  const tail = TAIL_BUCKET[curWindow.windowLevelId];
  const curBucketStart =
    !raw && tail && curWindow.start <= now && now <= curWindow.end
      ? getBucketStartTimeInMs(now, bucketMs, tzOffsetMinutes())
      : 0;
  const wantTail = curBucketStart >= curWindow.start && curBucketStart > 0;

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

  const domain: [number, number] = [curWindow.start, curWindow.end];

  function drill(t: number) {
    const child = drillInto(curWindow, t, tzOffsetMinutes());
    if (child) setWindows((w) => [...w, { ...child, live: isLive(child, now) }]);
  }
  // i indexes crumbs, which may lead with the live root.
  function jumpToCrumb(i: number) {
    if (rootIsExplicit) setWindows((w) => w.slice(0, i + 1));
    else if (i === 0) setWindows([]); // back to the week window level view
    else setWindows((w) => w.slice(0, i)); // crumbs[i] === windows[i - 1]
  }
  function popWindowLevel() {
    setWindows((w) => w.slice(0, -1));
  }
  function shift(direction: -1 | 1) {
    const nextWindow = pan(curWindow, direction);
    setWindows((w) => [...w.slice(0, -1), { ...nextWindow, live: isLive(nextWindow, now) }]);
  }

  const atNow = curWindow.end >= now;

  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <span className="h-3 w-1 rounded-full bg-primary" />
          History
        </h2>

        {/* breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((w, i) => {
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
                  {WINDOW_LEVELS[w.windowLevelId].label}
                  <span className="ml-1.5 hidden text-xs opacity-70 sm:inline">
                    {crumbLabel(w.windowLevelId, w.start)}
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
            <IconBtn label="Back out one level" onClick={popWindowLevel}>
              <ArrowLeft size={16} />
            </IconBtn>
          )}
          <IconBtn
            label="Reset to the last 7 days"
            onClick={() => setWindows([])}
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
            windowLevelId={curWindow.windowLevelId}
            color="var(--temp)"
            unitSuffix={unitSymbol(unit)}
            digits={1}
            canDrill={canDrill}
            onDrill={drill}
            loading={isLoading}
            live={live}
          />
          <MetricChart
            title="Humidity (%)"
            icon={<Droplets size={16} className="text-humidity" />}
            data={humPoints}
            domain={domain}
            windowLevelId={curWindow.windowLevelId}
            color="var(--humidity)"
            unitSuffix="%"
            digits={0}
            canDrill={canDrill}
            onDrill={drill}
            loading={isLoading}
            live={live}
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted transition hover:text-primary hover:border-primary/40 hover:bg-primary-soft/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
    >
      {children}
    </button>
  );
}
