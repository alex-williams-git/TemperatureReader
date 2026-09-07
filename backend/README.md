# Backend — DHT11 Monitor API

FastAPI service. A daemon thread reads JSON lines from the Arduino over
serial and writes them to SQLite; the API serves that table over REST.
Live data is **polled** (no WebSocket) — see the root `CLAUDE.md`.

## Run locally (Windows, native)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy .env.example .env        # then edit SERIAL_PORT if not COM3
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

The Arduino serial port can only be held by one process. Close any
PlatformIO / Arduino IDE **Serial Monitor** before starting the API.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | serial link status, last error, row count |
| GET | `/readings/latest` | 404 until the first reading lands |
| GET | `/readings/history?since=<iso>&limit=<n>` | oldest-first; `limit` 1–5000, default 500 |
| GET | `/docs` | Swagger UI |

## Config (env vars / `.env`)

| Var | Default | |
|---|---|---|
| `SERIAL_PORT` | `COM3` | `/dev/ttyUSB0` on Linux/Docker |
| `SERIAL_BAUD` | `9600` | must match the sketch |
| `DB_PATH` | `./data/readings.db` | gitignored; created on first run |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated |

## Notes

- `data/` holds the SQLite file (WAL mode → also `.db-wal`, `.db-shm`).
  Delete the folder to reset history.
- Timestamps are assigned backend-side on arrival (the Uno has no clock).
