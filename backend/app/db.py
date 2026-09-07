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
