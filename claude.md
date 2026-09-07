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
│   └── Dockerfile             # (not written yet)
├── frontend/
│   ├── app/                    # Next.js app router
│   │   ├── page.tsx
│   │   └── components/
│   │       ├── LiveReading.tsx
│   │       └── HistoryChart.tsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── .gitignore
```

## Known gotchas to handle carefully

- **Serial port passthrough in Docker.** The backend container needs
  access to the host's `/dev/ttyUSB0` (or equivalent) — requires explicit
  `devices:` config in docker-compose. This is the fiddliest part of the
  dockerization.
- **SQLite file must be a mounted volume**, not baked into the image, or
  data is lost on every rebuild.
- **CORS** needs configuring on FastAPI once frontend (port 3000) and
  backend (port 8000) are separate containers.

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
      — runs natively in `backend/.venv`; endpoints: `/health`,
      `/readings/latest`, `/readings/history?since=&limit=`. Verified against
      the live sensor. Docker deferred (see decision below).
- [ ] Next.js frontend (live reading + history chart)
- [ ] Dockerfiles for backend and frontend
- [ ] docker-compose.yml with serial device passthrough
- [ ] Push to GitHub

## Learning goal note

The developer wants to understand *why* behind decisions, not just receive
code — prefer explaining tradeoffs and asking clarifying questions over
silently generating a finished solution.