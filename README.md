# DHT11 Temperature & Humidity Monitor

Reads temperature and humidity from a **DHT11 sensor on an Arduino Uno**,
stores the readings in **SQLite** via a **Python/FastAPI** backend, and
(soon) displays them on a **Next.js** dashboard.

v1 scope is **sensing + logging/dashboard only** — no active fan control yet.

## Architecture

```
[DHT11] --(digital pin)--> [Arduino Uno]
                                 |  USB serial, one JSON line per reading
                                 |  {"temp_c":21.5,"temp_f":70.7,"humidity":45.0}
                                 v
                    [FastAPI backend]
                      - daemon thread reads serial, writes to SQLite
                      - REST API (polled, not WebSocket)
                                 |  HTTP
                                 v
                    [Next.js frontend]
                      - live values + historical chart
```

Why these choices (polling over WebSocket, SQLite over Postgres, JSON over
serial, …) are documented in [CLAUDE.md](CLAUDE.md#key-decisions-and-why).

## Repository layout

| Path | What |
|---|---|
| [`arduino/TemperatureSerializer/`](arduino/TemperatureSerializer/) | PlatformIO project for the Uno (`env:uno`) |
| [`backend/`](backend/) | FastAPI service — serial reader, SQLite, REST API ([README](backend/README.md)) |
| [`frontend/`](frontend/) | Next.js dashboard — live values + drill-down charts |
| [`CLAUDE.md`](CLAUDE.md) | Full design rationale and status |

## Quick start

### 1. Flash the Arduino

Requires [PlatformIO](https://platformio.org/). With the Uno connected:

```bash
pio run -d arduino/TemperatureSerializer -t upload
```

It then emits one JSON line every couple of seconds over serial at 9600 baud.

### 2. Run the stack with Docker (recommended)

```powershell
# 1. Bridge the Arduino's COM port to TCP (native — Docker on Windows can't
#    see COM ports directly). Leave this running.
serial-bridge\run-bridge.bat

# 2. Bring up the backend + frontend
copy .env.example .env        # optional — only to change SERIAL_PORT / ports
docker compose up --build
```

- Dashboard: <http://localhost:3000>
- API / Swagger: <http://localhost:8000/docs>

The frontend reaches the API through a same-origin `/api` proxy, so there's
no CORS to configure. SQLite persists in the `db-data` volume across rebuilds
(`docker compose down -v` wipes it). See
[`serial-bridge/README.md`](serial-bridge/README.md) for why the bridge exists
and how to auto-start it at logon.

### 3. Or run the backend natively (dev)

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Windows
# .venv/bin/pip install -r requirements.txt      # macOS/Linux
cp .env.example .env                             # set SERIAL_PORT (e.g. COM3, /dev/ttyUSB0)
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

| Endpoint | Description |
|---|---|
| `GET /health` | serial link status, last error, row count |
| `GET /readings/latest` | most recent reading |
| `GET /readings/history?since=<iso>&limit=<n>` | history, oldest-first |
| `GET /readings/range?start=<iso>&end=<iso>` | raw readings in a window |
| `GET /readings/aggregate?start=&end=&bucket=&tz_offset_minutes=` | time-bucketed avg/min/max |
| `GET /docs` | interactive API docs |

Only one process can hold the serial port — close any Serial Monitor first
(including `serial-bridge`, if it's running). See
[`backend/README.md`](backend/README.md) for full config and notes.

### 4. Or run the frontend natively (dev)

```bash
cd frontend
npm install
npm run dev                          # http://localhost:3000
```

`npm run dev` proxies `/api/*` to `http://localhost:8000` by default (set
`BACKEND_ORIGIN` to change it), so the native backend above just needs to be
running.

The dashboard shows the live reading plus a **click-to-drill history chart**:
week → day → hour → 10-minute raw, with a shaded min/max band, a °C/°F
toggle, and light/dark themes. Each zoom level is a server-side time-bucket
query, so it stays fast regardless of how much history accumulates.

## Status

- [x] Arduino emits structured JSON over serial
- [x] FastAPI backend — serial reader + SQLite + REST endpoints
- [x] Next.js frontend — live reading + drill-down history charts
- [x] Dockerfiles + `docker-compose.yml` + `serial-bridge` (COM→TCP on Windows)

## Hardware

- Arduino Uno
- DHT11 sensor on digital pin **2**
- USB connection to the host running the backend
