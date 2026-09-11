"""FastAPI app: REST over the readings table + a background serial reader.

Live data is polled over REST (see CLAUDE.md) — no WebSocket. The DHT11's
~2s floor means there is nothing to push faster than a client can poll.
"""
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import (
    aggregate,
    count_readings,
    history,
    history_range,
    init_db,
    latest_reading,
)
from .models import AggregateBucket, Health, Reading, WeeklySummary
from .serial_reader import SerialReader

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

reader = SerialReader()

# Bucket widths the frontend's zoom levels ask for.
BUCKET_SECONDS = {
    "day": 86_400,
    "hour": 3_600,
    "ten_min": 600,
    "minute": 60,
}

# Weekly-summary temp bands (°C) — matches thermal-profile.json's idle /
# sustained_workload / heavy_gaming bands for this machine
TEMP_LOW_MIN_C = 21.1
TEMP_LOW_MAX_C = 28.3
TEMP_MEDIUM_MAX_C = 35.0
TEMP_HIGH_MAX_C = 46.1


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    reader.start()
    try:
        yield
    finally:
        reader.stop()


app = FastAPI(title="DHT11 Monitor API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health", response_model=Health)
def health() -> Health:
    row = latest_reading()
    return Health(
        status="ok",
        serial_connected=reader.connected,
        serial_last_error=reader.last_error,
        last_reading_ts=row["ts"] if row else None,
        total_readings=count_readings(),
    )


@app.get("/readings/latest", response_model=Reading)
def readings_latest() -> Reading:
    row = latest_reading()
    if row is None:
        raise HTTPException(status_code=404, detail="No readings recorded yet")
    return Reading(**dict(row))


@app.get("/readings/history", response_model=list[Reading])
def readings_history(
    since: str | None = Query(
        None, description="ISO-8601 UTC lower bound on ts (inclusive)"
    ),
    limit: int = Query(500, ge=1, le=5000),
) -> list[Reading]:
    return [Reading(**dict(r)) for r in history(since, limit)]


@app.get("/readings/range", response_model=list[Reading])
def readings_range(
    start: str = Query(..., description="ISO-8601 UTC, inclusive"),
    end: str = Query(..., description="ISO-8601 UTC, exclusive"),
    limit: int = Query(2000, ge=1, le=10_000),
) -> list[Reading]:
    """Raw readings inside a window — the deepest zoom level on the frontend."""
    return [Reading(**dict(r)) for r in history_range(start, end, limit)]


@app.get("/readings/aggregate", response_model=list[AggregateBucket])
def readings_aggregate(
    start: str = Query(..., description="ISO-8601 UTC, inclusive"),
    end: str = Query(..., description="ISO-8601 UTC, exclusive"),
    bucket: str = Query("hour", description="day | hour | ten_min | minute"),
    tz_offset_minutes: int = Query(
        0,
        ge=-840,
        le=840,
        description="Viewer's offset from UTC in minutes (JS: -getTimezoneOffset())"
        ", so bucket edges land on local midnight/hour",
    ),
) -> list[AggregateBucket]:
    if bucket not in BUCKET_SECONDS:
        raise HTTPException(
            status_code=422,
            detail=f"bucket must be one of {sorted(BUCKET_SECONDS)}",
        )
    rows = aggregate(
        start, end, BUCKET_SECONDS[bucket], tz_offset_seconds=tz_offset_minutes * 60
    )
    return [
        AggregateBucket(
            bucket_start=datetime.fromtimestamp(
                r["bucket_epoch"], tz=timezone.utc
            ).strftime("%Y-%m-%dT%H:%M:%SZ"),
            count=r["n"],
            # avg keeps 2 decimals: averaging many noisy ±2°C samples genuinely
            # narrows the estimate of the mean — not false precision. min/max are
            # single raw readings, so they stay at the sensor's 1 decimal.
            temp_c_avg=round(r["temp_c_avg"], 2),
            temp_c_min=round(r["temp_c_min"], 1),
            temp_c_max=round(r["temp_c_max"], 1),
            temp_f_avg=round(r["temp_f_avg"], 2),
            temp_f_min=round(r["temp_f_min"], 1),
            temp_f_max=round(r["temp_f_max"], 1),
            humidity_avg=round(r["humidity_avg"], 2),
            humidity_min=round(r["humidity_min"], 1),
            humidity_max=round(r["humidity_max"], 1),
        )
        for r in rows
    ]

@app.get("/readings/weekly_summary", response_model=WeeklySummary)
def readings_weekly_summary(
    start: str = Query(..., description="ISO-8601 UTC, inclusive"),
    end: str = Query(..., description="ISO-8601 UTC, exclusive"),
) -> WeeklySummary:
    # Weekly summary of readings inside a window. Capped at a week's worth of readings
    row = history_range(start, end, limit=7 * 24 * 60 * 30)

    if not row:
        raise HTTPException(status_code=404, detail="No readings recorded yet")

    # Consider moving this calculation to its own function in db.py
    readings = len(row)
    avg_temp_c = sum(r["temp_c"] for r in row) / readings
    avg_temp_f = sum(r["temp_f"] for r in row) / readings
    percent_in_low = (
        sum(1 for r in row if TEMP_LOW_MIN_C <= r["temp_c"] < TEMP_LOW_MAX_C) / readings * 100
    )
    percent_in_medium = (
        sum(1 for r in row if TEMP_LOW_MAX_C <= r["temp_c"] < TEMP_MEDIUM_MAX_C) / readings * 100
    )
    percent_in_high = (
        sum(1 for r in row if TEMP_MEDIUM_MAX_C <= r["temp_c"] < TEMP_HIGH_MAX_C) / readings * 100
    )

    return WeeklySummary(
        readings=readings,
        avg_temp_c=round(avg_temp_c, 2),
        avg_temp_f=round(avg_temp_f, 2),
        percent_in_low=round(percent_in_low, 2),
        percent_in_medium=round(percent_in_medium, 2),
        percent_in_high=round(percent_in_high, 2),
    )