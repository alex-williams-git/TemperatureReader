// The four zoom window levels. Each window level defines how wide the visible
// window is and which server-side bucket size fills it. Drilling in clicks a
// bucket and makes it the whole window of the next window level down.
//
//   week  →  7 days of  1-day  buckets   (7 points)
//   day   →  24 h of     1-hour buckets   (24 points)
//   hour  →  60 min of  10-min  buckets   (6 points)
//   10min →  10 min of  raw readings      (~60 points)

export type WindowLevelId = "week" | "day" | "hour" | "ten_min";

export type BucketParam = "day" | "hour" | "ten_min" | "minute" | "raw";

export interface WindowLevel {
  id: WindowLevelId;
  label: string;
  windowSpanMs: number;
  bucket: BucketParam;
  childId: WindowLevelId | null;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const WINDOW_LEVELS: Record<WindowLevelId, WindowLevel> = {
  week: { id: "week", label: "Week", windowSpanMs: 7 * DAY, bucket: "day", childId: "day" },
  day: { id: "day", label: "Day", windowSpanMs: DAY, bucket: "hour", childId: "hour" },
  hour: { id: "hour", label: "Hour", windowSpanMs: HOUR, bucket: "ten_min", childId: "ten_min" },
  ten_min: { id: "ten_min", label: "10 min", windowSpanMs: 10 * MIN, bucket: "raw", childId: null },
};

export interface TimeWindow {
  windowLevelId: WindowLevelId;
  start: number; // epoch ms, inclusive
  end: number; // epoch ms, exclusive
  live?: boolean; // true if this window is still live (end >= now)
}

export const ROOT_WINDOW_LEVEL: WindowLevelId = "week";

// When a live window's newest bucket is still filling, re-query just that
// bucket at this finer size so the current period shows sub-bucket movement
// instead of one flat point. `null` at the raw window level (nothing finer).
export const TAIL_BUCKET: Record<WindowLevelId, { param: BucketParam; ms: number } | null> = {
  week: { param: "hour", ms: HOUR },
  day: { param: "ten_min", ms: 10 * MIN },
  hour: { param: "minute", ms: MIN },
  ten_min: null,
};

// Left edge of the fixed-width bucket containing `atMs`, aligned to the
// viewer's local clock (matches the backend's tz-aware bucketing).
export function getBucketStartTimeInMs(atMs: number, widthMs: number, tzOffsetMin: number): number {
  const off = tzOffsetMin * 60_000;
  return Math.floor((atMs + off) / widthMs) * widthMs - off;
}

// In the past version, only the initial week view window was defined. The following function
// is an implementation of live windows at different window levels, which will be used to create a
// live view of the data based on the current time and timezone offset.
export function getLiveWindow(windowLevelId: WindowLevelId, now: number, timezoneOffsetMin: number, isLiveShift: boolean): TimeWindow {
  const curWindowLevel = WINDOW_LEVELS[windowLevelId];

  // Root: window spans many buckets with no natural anchor, so we have to handle differently
  if (windowLevelId === ROOT_WINDOW_LEVEL) {
    const edgeMs = WINDOW_LEVELS[curWindowLevel.childId!].windowSpanMs; // 1 DAY
    const end = getBucketStartTimeInMs(now, edgeMs, timezoneOffsetMin) + edgeMs;
    return { windowLevelId, start: end - curWindowLevel.windowSpanMs, end };
  }

  // If we are on a shifted live view, show the next 3 buckets
  if (isLiveShift) {
    const additionalLength = curWindowLevel.childId ? WINDOW_LEVELS[curWindowLevel.childId].windowSpanMs * 3 : MIN * 3;
    const end = now + additionalLength;

    return {windowLevelId, start: end - curWindowLevel.windowSpanMs, end: end};
  }

  // Deeper window levels: the window *is* one clock block — snap to it, flip at its edge.
  const start = getBucketStartTimeInMs(now, curWindowLevel.windowSpanMs, timezoneOffsetMin);
  return { windowLevelId, start, end: start + curWindowLevel.windowSpanMs };
}

// Click a bucket in `curWindow` → the child-window-level window starting at that
// bucket. The clicked point may sit mid-bucket (a live window splices finer tail
// points into the in-progress bucket — e.g. a 12:30 ten-min point on the day
// view), so snap the new window's start to the child bucket's own edge,
// aligned to the viewer's local clock like the backend's bucketing.
export function drillInto(curWindow: TimeWindow, clickedMs: number, tzOffsetMin: number): TimeWindow | null {
  const child = WINDOW_LEVELS[curWindow.windowLevelId].childId;
  if (!child) return null;
  // Ignore clicks at/after the window's end — e.g. the synthetic trailing point
  // that stretches the last bucket to the edge.
  if (clickedMs >= curWindow.end) return null;
  const span = WINDOW_LEVELS[child].windowSpanMs;
  const start = getBucketStartTimeInMs(clickedMs, span, tzOffsetMin);
  return {
    windowLevelId: child,
    start,
    end: start + span,
  };
}

// Shift the window one full span earlier / later at the same window level.
export function pan(curWindow: TimeWindow, direction: -1 | 1): TimeWindow {
  const span = WINDOW_LEVELS[curWindow.windowLevelId].windowSpanMs;
  return {
    ...curWindow,
    start: curWindow.start + direction * span,
    end: curWindow.end + direction * span,
  };
}

// Does this window still contain "now" (so it's worth auto-refreshing)?
// Panned-back / drilled-in windows that end in the past are frozen and don't
// poll. `now` of 0 (server snapshot) counts as "not live".
export function isLive(curWindow: TimeWindow, now: number): boolean {
  return now > 0 && curWindow.end > now;
}

// JS getTimezoneOffset() is (UTC - local) in minutes; the API wants the sign
// flipped so bucket edges land on the viewer's local midnight / hour.
export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}
