// The four zoom levels. Each level defines how wide the visible window is and
// which server-side bucket size fills it. Drilling in clicks a bucket and makes
// it the whole window of the next level down.
//
//   week  →  7 days of  1-day  buckets   (7 points)
//   day   →  24 h of     1-hour buckets   (24 points)
//   hour  →  60 min of  10-min  buckets   (6 points)
//   10min →  10 min of  raw readings      (~60 points)

export type LevelId = "week" | "day" | "hour" | "ten_min";

export type BucketParam = "day" | "hour" | "ten_min" | "raw";

export interface Level {
  id: LevelId;
  label: string;
  spanMs: number;
  bucket: BucketParam;
  childId: LevelId | null;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const LEVELS: Record<LevelId, Level> = {
  week: { id: "week", label: "Week", spanMs: 7 * DAY, bucket: "day", childId: "day" },
  day: { id: "day", label: "Day", spanMs: DAY, bucket: "hour", childId: "hour" },
  hour: { id: "hour", label: "Hour", spanMs: HOUR, bucket: "ten_min", childId: "ten_min" },
  ten_min: { id: "ten_min", label: "10 min", spanMs: 10 * MIN, bucket: "raw", childId: null },
};

export interface Frame {
  levelId: LevelId;
  start: number; // epoch ms, inclusive
  end: number; // epoch ms, exclusive
}

export const ROOT_LEVEL: LevelId = "week";

/** Opening view: the last week, ending now. */
export function initialFrame(now: number = Date.now()): Frame {
  return { levelId: ROOT_LEVEL, start: now - LEVELS[ROOT_LEVEL].spanMs, end: now };
}

/** Click a bucket at `frame` → the child-level frame starting at that bucket. */
export function drillInto(frame: Frame, bucketStartMs: number): Frame | null {
  const child = LEVELS[frame.levelId].childId;
  if (!child) return null;
  return {
    levelId: child,
    start: bucketStartMs,
    end: bucketStartMs + LEVELS[child].spanMs,
  };
}

/** Shift the window one full span earlier / later at the same level. */
export function pan(frame: Frame, direction: -1 | 1): Frame {
  const span = LEVELS[frame.levelId].spanMs;
  return { ...frame, start: frame.start + direction * span, end: frame.end + direction * span };
}

/** Does this window run up against "now" (so it's worth auto-refreshing)?
 *  `now` of 0 (server snapshot) counts as "not live". */
export function isLive(frame: Frame, now: number): boolean {
  return now > 0 && frame.end >= now - LEVELS[frame.levelId].spanMs;
}

/** JS getTimezoneOffset() is (UTC - local) in minutes; the API wants the sign
 *  flipped so bucket edges land on the viewer's local midnight / hour. */
export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}
