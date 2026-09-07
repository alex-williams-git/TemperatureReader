"""FastAPI app: REST over the readings table + a background serial reader.

Live data is polled over REST (see CLAUDE.md) — no WebSocket. The DHT11's
~2s floor means there is nothing to push faster than a client can poll.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import count_readings, history, init_db, latest_reading
from .models import Health, Reading
from .serial_reader import SerialReader

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

reader = SerialReader()


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
