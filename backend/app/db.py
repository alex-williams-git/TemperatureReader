"""SQLite access.

Single process, one writer (the serial reader thread) and a handful of
readers (API request handlers). WAL mode lets reads proceed while the
writer holds a write transaction; a threading.Lock serializes writes so
two code paths can never interleave an INSERT + COMMIT.
"""
import sqlite3
import threading
from pathlib import Path

from .config import settings

_conn: sqlite3.Connection | None = None
_write_lock = threading.Lock()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,          -- UTC ISO-8601, e.g. 2026-09-06T12:34:56.789012Z
    temp_c    REAL NOT NULL,
    temp_f    REAL NOT NULL,
    humidity  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings (ts);
"""


def init_db() -> None:
    global _conn
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    _conn = sqlite3.connect(settings.db_path, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    _conn.execute("PRAGMA journal_mode=WAL;")
    _conn.execute("PRAGMA synchronous=NORMAL;")
    _conn.executescript(_SCHEMA)
    _conn.commit()


def _require_conn() -> sqlite3.Connection:
    if _conn is None:
        raise RuntimeError("DB not initialized; call init_db() first")
    return _conn


def insert_reading(ts: str, temp_c: float, temp_f: float, humidity: float) -> None:
    conn = _require_conn()
    with _write_lock:
        conn.execute(
            "INSERT INTO readings (ts, temp_c, temp_f, humidity) VALUES (?, ?, ?, ?)",
            (ts, temp_c, temp_f, humidity),
        )
        conn.commit()


def latest_reading() -> sqlite3.Row | None:
    return _require_conn().execute(
        "SELECT * FROM readings ORDER BY id DESC LIMIT 1"
    ).fetchone()


def count_readings() -> int:
    return _require_conn().execute("SELECT COUNT(*) AS c FROM readings").fetchone()["c"]


def history(since: str | None, limit: int) -> list[sqlite3.Row]:
    """Most recent `limit` rows (optionally with ts >= `since`), returned
    oldest-first so a chart can plot them left-to-right."""
    conn = _require_conn()
    if since:
        rows = conn.execute(
            "SELECT * FROM readings WHERE ts >= ? ORDER BY id DESC LIMIT ?",
            (since, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM readings ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return list(reversed(rows))


def history_range(start: str, end: str, limit: int) -> list[sqlite3.Row]:
    """Raw readings with start <= ts < end, oldest-first. Used by the
    frontend's deepest zoom level (a ~10-minute window)."""
    return _require_conn().execute(
        "SELECT * FROM readings WHERE ts >= ? AND ts < ? ORDER BY id ASC LIMIT ?",
        (start, end, limit),
    ).fetchall()


def aggregate(
    start: str, end: str, bucket_seconds: int, tz_offset_seconds: int = 0
) -> list[sqlite3.Row]:
    """Group readings in [start, end) into fixed-width time buckets, returning
    avg/min/max per bucket for each metric.

    Bucket edges are aligned to local midnight/hour by shifting the epoch by
    `tz_offset_seconds` before the floor-divide and shifting back after — so a
    viewer in UTC-4 sees days that start at their midnight, not UTC's.
    """
    return _require_conn().execute(
        """
        SELECT
            ((CAST(strftime('%s', substr(ts, 1, 19)) AS INTEGER) + :off) / :bs) * :bs - :off
                                     AS bucket_epoch,
            COUNT(*)                 AS n,
            AVG(temp_c)              AS temp_c_avg,
            MIN(temp_c)              AS temp_c_min,
            MAX(temp_c)              AS temp_c_max,
            AVG(temp_f)              AS temp_f_avg,
            MIN(temp_f)              AS temp_f_min,
            MAX(temp_f)              AS temp_f_max,
            AVG(humidity)            AS humidity_avg,
            MIN(humidity)            AS humidity_min,
            MAX(humidity)            AS humidity_max
        FROM readings
        WHERE ts >= :start AND ts < :end
        GROUP BY bucket_epoch
        ORDER BY bucket_epoch
        """,
        {
            "bs": bucket_seconds,
            "off": tz_offset_seconds,
            "start": start,
            "end": end,
        },
    ).fetchall()
