# DHT11 Fan/Temp Monitoring Project

## Overview
A project to read temperature/humidity from a DHT11 sensor on an Arduino Uno,
store readings in SQLite via a Python backend, and display them on a Next.js
dashboard. Fully dockerized (except the Arduino itself, which is flashed
separately). v1 scope is **sensing + dashboard/logging only** — no active
fan control yet (may be added later as a v2).

## Architecture

```
[DHT11] --(digital pin)--> [Arduino Uno, C++]
                                  |
                            (USB Serial, JSON lines)
                                  v
                     [Python backend — FastAPI]
                       - reads serial in background thread/task
                       - writes readings to SQLite
                       - exposes REST API (/readings/latest, /readings/history)
                                  |
                            (HTTP, polled — NOT WebSocket)
                                  v
                     [Next.js frontend]
                       - fetches via SWR or TanStack Query
                       - renders live values + historical chart
```

## Key decisions (and why)

- **Backend language: Python (FastAPI).** Chosen by the developer for this
  project; also a good fit for pyserial + SQLite.
- **Live data: REST polling, not WebSocket.** DHT11 has a hard ~2s floor
  between readings (it's a slow sensor), so there's no benefit to a
  persistent push connection. Polling every 2-5s from the frontend
  (via SWR/TanStack Query) is simpler to implement, easier to
  containerize (no sticky connections behind a reverse proxy), and loses
  nothing. Revisit WebSocket only if active fan control / sub-second
  responsiveness is added later.
- **Database: SQLite.** Single writer (backend polling serial), a few
  readers (frontend polling REST) — exactly SQLite's sweet spot. Zero
  setup, file-based, easy to back up/inspect/reset during dev. Would
  reconsider (Postgres/Timescale) only if this became a multi-writer or
  remote-access production service.
- **Arduino emits JSON over serial, not human-readable text.** One JSON
  line per reading (e.g. `{"temp_c":21.5,"temp_f":70.7,"humidity":45.0}`),
  so the backend just does `json.loads()` — no fragile string parsing.
  Sensor errors are also emitted as JSON (`{"error": "..."}`) so the
  backend has one parsing code path, not two.
- **DHT11 precision:** ±1°C resolution, ±2°C accuracy, ~0.5Hz max sample
  rate. Values are printed to 1 decimal place only — more would be false
  precision. This sensor is well suited to slow trend monitoring
  (dust/airflow degradation, humidity/condensation risk, anomaly
  detection) but NOT to fast, responsive active fan control — keep that
  distinction in mind if scope expands.

## Folder structure

```
dht11-fan-project/
├── CLAUDE.md
├── arduino/
│   └── TemperatureSerializer/  # PlatformIO project (env:uno)
│       ├── platformio.ini      # lib_deps: Adafruit DHT + Unified Sensor
│       └── src/main.cpp        # emits one JSON line per reading
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + routes (lifespan starts reader)
│   │   ├── serial_reader.py   # daemon thread: serial -> SQLite, auto-reconnect
│   │   ├── db.py              # SQLite (WAL) connection + schema + queries
│   │   ├── models.py          # Pydantic response models
│   │   └── config.py          # env-var settings (pydantic-settings)
│   ├── .env.example
│   ├── requirements.txt
│   ├── .dockerignore
│   └── Dockerfile             # python:3.12-slim, non-root, /data volume
├── serial-bridge/             # native Windows helper: COM port -> TCP socket
│   ├── bridge.py              #   (so the Dockerized backend can read serial)
│   ├── run-bridge.bat
│   ├── requirements.txt
│   └── README.md
├── frontend/                   # Next.js 16 (App Router) + React 19 + Tailwind v4
│   ├── app/
│   │   ├── layout.tsx          # + providers.tsx (next-themes)
│   │   ├── page.tsx            # renders <Dashboard/>
│   │   ├── globals.css         # design tokens, light/dark, blue palette
│   │   └── components/
│   │       ├── Dashboard.tsx       # client-gated shell, holds unit state
│   │       ├── LiveReading.tsx     # polls /readings/latest
│   │       ├── HistoryChart.tsx    # drill-down zoom stack + breadcrumb
│   │       ├── MetricChart.tsx     # one Recharts panel (avg line + min/max band)
│   │       ├── ConnectionBadge.tsx / ThemeToggle.tsx / UnitToggle.tsx
│   ├── lib/                    # api.ts, zoom.ts, format.ts, clientHooks.ts, …
│   ├── .env.local.example
│   ├── next.config.ts          # output: "standalone" + /api -> backend rewrite
│   ├── package.json
│   ├── .dockerignore
│   └── Dockerfile             # multi-stage, standalone output, node:22-alpine
├── docker-compose.yml         # backend + frontend; named volume for the DB
├── .env.example               # compose reads .env here (SERIAL_PORT, ports)
└── .gitignore
```

## Known gotchas to handle carefully

- **Serial passthrough on Windows + Docker Desktop is not possible directly.**
  Docker Desktop runs containers in a WSL2 Linux VM; a Windows `COM3` handle
  can't be handed to it (the `devices:` mapping only works on a Linux Docker
  host). Solution in this repo: `serial-bridge/bridge.py` runs *natively* on
  Windows, holds the COM port, and re-exposes the byte stream on TCP :9600.
  The backend container sets `SERIAL_PORT=socket://host.docker.internal:9600`
  and pyserial's `serial_for_url` handles the rest — the `readline()` +
  reconnect loop in `serial_reader.py` is unchanged. On a Linux host later,
  drop the bridge and use `SERIAL_PORT=/dev/ttyACM0` + `devices:` instead.
- **The serial-bridge must be running on the host** whenever the stack is up
  (`serial-bridge/run-bridge.bat`, or a Task Scheduler "at logon" task). It's
  the one piece that can't be containerized.
- **SQLite lives on a named volume** (`db-data`), not a bind mount: bind
  mounts from Windows into a Linux container have known WAL/locking quirks.
  Inspect/reset with `docker compose down -v` or `docker run --rm -v
  dht11-monitor_db-data:/data ...`.
- **CORS is now bypassed by default.** The frontend calls a same-origin `/api`
  path that the Next server proxies to the backend (`next.config.ts` rewrite),
  so no browser cross-origin request is made. The backend still has the
  CORSMiddleware for direct `:8000` access; `CORS_ORIGINS` only matters then.
- **The `/api` rewrite target is baked at `next build` time**, not read at
  runtime — `frontend/Dockerfile` sets `BACKEND_ORIGIN=http://backend:8000`
  in the builder stage.

## Current Arduino sketch (working, prints readings to serial)

```cpp
#include <Arduino.h>
#include "DHT.h"

#define DHTPIN 2
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000); // DHT11 minimum interval between reads

  float h = dht.readHumidity();
  float t = dht.readTemperature();       // Celsius
  float f = dht.readTemperature(true);   // Fahrenheit

  if (isnan(h) || isnan(t) || isnan(f)) {
    Serial.println("{\"error\":\"Failed to read from DHT sensor\"}");
    return;
  }

  Serial.print("{\"temp_c\":");
  Serial.print(t, 1);
  Serial.print(",\"temp_f\":");
  Serial.print(f, 1);
  Serial.print(",\"humidity\":");
  Serial.print(h, 1);
  Serial.println("}");
}
```

## Status

- [x] Arduino reads DHT11 and prints valid data over serial
- [x] Arduino sketch updated to emit structured JSON (flashed to Uno on COM3)
- [x] Python FastAPI backend (serial reader + SQLite + REST endpoints)
      — runs natively in `backend/.venv`. Endpoints: `/health`,
      `/readings/latest`, `/readings/history`, `/readings/range` (raw window),
      `/readings/aggregate` (time-bucketed avg/min/max, tz-aware). Verified
      against the live sensor. Docker deferred (see decision below).
- [x] Next.js frontend (live reading + drill-down history charts)
      — `frontend/`, Next 16 + React 19 + Tailwind v4. Runs on :3000 against
      the backend on :8000. Live card polls `/readings/latest` (SWR); history
      is a click-to-drill zoom stack (week → day → hour → 10-min raw) with a
      shaded min/max band, °C/°F toggle, and light/dark themes. Verified in
      Chrome (build + lint + typecheck clean).
- [x] Dockerfiles for backend and frontend + `docker-compose.yml`
      — `backend/Dockerfile` (python:3.12-slim, non-root, `/data` volume),
      `frontend/Dockerfile` (multi-stage → Next standalone on node:22-alpine),
      `serial-bridge/` (native Windows COM→TCP helper — see gotchas). Frontend
      talks to the backend through a same-origin `/api` rewrite. `next build`
      verified clean; **image build/run not yet verified** (Docker Desktop was
      down when written) — run `docker compose build && docker compose up`.
- [ ] Push to GitHub

## Frontend notes

- **Zoom = drill-down, not free pan.** A week at 10s cadence is ~60k points;
  each zoom level is instead a server-side `GROUP BY` time-bucket query
  (`/readings/aggregate`) returning a handful of points. Deepest level
  (10-min) switches to `/readings/range` for raw readings.
- **Bucket edges are tz-aware.** The frontend sends `tz_offset_minutes` so
  "days" and "hours" start at the viewer's local midnight/hour, not UTC's.
- **Whole dashboard is client-gated** (`useIsClient`, an external-store hook).
  It's all live/clock/localStorage-driven — nothing meaningful to SSR — and
  gating kills hydration mismatches in one place.
- Charts: Recharts. Theme + unit persisted to `localStorage`.

## Learning goal note

The developer wants to understand *why* behind decisions, not just receive
code — prefer explaining tradeoffs and asking clarifying questions over
silently generating a finished solution.