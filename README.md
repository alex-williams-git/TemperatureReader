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
                    [Next.js frontend]  (not built yet)
                      - live values + historical chart
```

Why these choices (polling over WebSocket, SQLite over Postgres, JSON over
serial, …) are documented in [CLAUDE.md](CLAUDE.md#key-decisions-and-why).

## Repository layout

| Path | What |
|---|---|
| [`arduino/TemperatureSerializer/`](arduino/TemperatureSerializer/) | PlatformIO project for the Uno (`env:uno`) |
| [`backend/`](backend/) | FastAPI service — serial reader, SQLite, REST API ([README](backend/README.md)) |
| `frontend/` | Next.js dashboard *(not built yet)* |
| [`CLAUDE.md`](CLAUDE.md) | Full design rationale and status |

## Quick start

### 1. Flash the Arduino

Requires [PlatformIO](https://platformio.org/). With the Uno connected:

```bash
pio run -d arduino/TemperatureSerializer -t upload
```

It then emits one JSON line every couple of seconds over serial at 9600 baud.

### 2. Run the backend

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
| `GET /docs` | interactive API docs |

Only one process can hold the serial port — close any Serial Monitor first.
See [`backend/README.md`](backend/README.md) for full config and notes.

## Status

- [x] Arduino emits structured JSON over serial
- [x] FastAPI backend — serial reader + SQLite + REST endpoints
- [ ] Next.js frontend — live reading + history chart
- [ ] Dockerfiles + `docker-compose.yml` (serial passthrough)

## Hardware

- Arduino Uno
- DHT11 sensor on digital pin **2**
- USB connection to the host running the backend
