# rgb-bridge — backend temp → OpenRGB spectrum

A tiny native Windows helper that polls the backend's `/readings/latest` and
pushes a blue-to-red color to OpenRGB, so **case/motherboard RGB tracks the
DHT11 reading**.

## Why this is needed

RGB control (iCUE/Aura/OpenRGB's device layer) needs direct Windows-native
hardware access (USB HID, SMBus) — the same class of thing a Linux container
can't reach, for the same reason the Arduino's COM port can't be passed into
one (see [`serial-bridge/README.md`](../serial-bridge/README.md)). So this
runs natively on Windows too, alongside the serial bridge, instead of living
in `docker-compose.yml`.

Unlike the serial bridge, no passthrough plumbing is needed on our end: the
OpenRGB desktop app already exposes a network SDK server (default TCP
:6742). This script is just an SDK client.

```
[backend :8000] --HTTP GET /readings/latest--> [rgb_bridge_main.py on Windows]
                                                          |
                                                   OpenRGB SDK :6742
                                                          v
                                            [OpenRGB app] --> RGB hardware
```

Requires the OpenRGB app to be running on this machine with its SDK server
enabled (Settings → SDK Server → Enable, or launched with `--server`).

## Running it

Double-click **`run-rgb-bridge.bat`**, or from a terminal:

```powershell
cd rgb-bridge
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe rgb_bridge_main.py
```

Its dependencies (`openrgb-python`, `requests`) are unrelated to the
backend's, so it gets its own `.venv` rather than reusing
`backend/.venv` the way the serial bridge does.

## Config (environment variables, all optional)

| Var | Default | Notes |
|---|---|---|
| `RGB_BACKEND_URL` | `http://localhost:8000` | same API the frontend polls |
| `RGB_POLL_INTERVAL` | `3.0` | seconds between reads; matches the DHT11's own ~2s floor |
| `RGB_OPENRGB_HOST` | `127.0.0.1` | |
| `RGB_OPENRGB_PORT` | `6742` | OpenRGB SDK server default |
| `RGB_OPENRGB_NAME` | `dht11-rgb-bridge` | shown as the connected client in the OpenRGB app |
| `RGB_TEMP_C_MIN` | `../thermal-profile.json` → `bands.idle.low_c` (21.1) | spectrum floor — blue end |
| `RGB_TEMP_C_MAX` | `../thermal-profile.json` → `bands.heavy_gaming.high_c` (46.1) | spectrum ceiling — red end |
| `RGB_RECONNECT_DELAY` | `3.0` | seconds between OpenRGB reconnect tries |
| `RGB_REQUEST_TIMEOUT` | `5.0` | seconds, HTTP calls to the backend |

The min/max default to [`thermal-profile.json`](../thermal-profile.json) at
the repo root — this machine's observed idle-to-peak-gaming range — which
the frontend's ambient warmth effect (`AmbientBackground.tsx`) also reads,
so the physical RGB and the on-screen glow agree. Set `RGB_TEMP_C_MIN`/`MAX`
to override just this script without touching the shared file.

## Verifying

With OpenRGB running (SDK server enabled) and the bridge running, its log
should show a `connected to OpenRGB SDK server` line followed by one
`temp=...C -> rgb=(...)` line per poll — and the OpenRGB app's device list
should show `dht11-rgb-bridge` as a connected client.
