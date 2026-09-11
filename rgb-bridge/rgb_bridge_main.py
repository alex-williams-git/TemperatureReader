"""
Backend temp -> OpenRGB spectrum, so case/motherboard RGB tracks the DHT11.

See README.md for why this runs natively on Windows (outside Docker) and how
it talks to OpenRGB. Requires the OpenRGB app to be running on this machine
with its SDK server enabled (Settings -> SDK Server -> Enable, or launched
with --server).

Cyan (cold) -> purple (midpoint) -> orange (hot). Spectrum floor/ceiling
default to the idle-low/gaming-high anchors in ../thermal-profile.json --
the repo's single source of truth for this machine's observed temp bands,
also used by the frontend's ambient warmth effect. Override with
RGB_TEMP_C_MIN/MAX below if you want this script's spectrum to diverge from
that shared calibration.

Config (environment variables, all optional):
    RGB_BACKEND_URL       default http://localhost:8000
    RGB_POLL_INTERVAL     default 3.0    (seconds between reads; matches the DHT11's own ~2s floor)
    RGB_OPENRGB_HOST      default 127.0.0.1
    RGB_OPENRGB_PORT      default 6742   (OpenRGB SDK server default)
    RGB_OPENRGB_NAME      default dht11-rgb-bridge (shown in the OpenRGB app)
    RGB_TEMP_C_MIN        default: thermal-profile.json bands.idle.low_c
    RGB_TEMP_C_MAX        default: thermal-profile.json bands.heavy_gaming.high_c
    RGB_RECONNECT_DELAY   default 3.0    (seconds between OpenRGB reconnect
                                          tries)
    RGB_REQUEST_TIMEOUT   default 5.0    (seconds, HTTP calls to the backend)
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import requests
from openrgb import OpenRGBClient
from openrgb.utils import RGBColor

_THERMAL_PROFILE_PATH = Path(__file__).resolve().parent.parent / "thermal-profile.json"
_thermal_profile = json.loads(_THERMAL_PROFILE_PATH.read_text(encoding="utf-8"))
_DEFAULT_TEMP_C_MIN = _thermal_profile["bands"]["idle"]["low_c"]
_DEFAULT_TEMP_C_MAX = _thermal_profile["bands"]["heavy_gaming"]["high_c"]

BACKEND_URL = os.environ.get("RGB_BACKEND_URL", "http://localhost:8000")
POLL_INTERVAL = float(os.environ.get("RGB_POLL_INTERVAL", "3.0"))
OPENRGB_HOST = os.environ.get("RGB_OPENRGB_HOST", "127.0.0.1")
OPENRGB_PORT = int(os.environ.get("RGB_OPENRGB_PORT", "6742"))
OPENRGB_NAME = os.environ.get("RGB_OPENRGB_NAME", "dht11-rgb-bridge")
TEMP_C_MIN = float(os.environ.get("RGB_TEMP_C_MIN", str(_DEFAULT_TEMP_C_MIN)))
TEMP_C_MAX = float(os.environ.get("RGB_TEMP_C_MAX", str(_DEFAULT_TEMP_C_MAX)))
RECONNECT_DELAY = float(os.environ.get("RGB_RECONNECT_DELAY", "3.0"))
REQUEST_TIMEOUT = float(os.environ.get("RGB_REQUEST_TIMEOUT", "5.0"))

# Three-stop spectrum: cold end -> midpoint -> hot end.
COLOR_COLD = RGBColor(0, 255, 255)    # cyan
COLOR_MID = RGBColor(140, 0, 255)     # purple
COLOR_HOT = RGBColor(255, 100, 0)     # orange


def log(msg: str) -> None:
    print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} rgb-bridge: {msg}", flush=True)

def sanitize_range(n: float) -> float:
    return min(1.0, max(0.0, n)) # Restricts warmth to [0,1] so it can't overshoot past either end stop.

def _lerp_color(a: RGBColor, b: RGBColor, t: float) -> RGBColor:
    return RGBColor(
        round(a.red + (b.red - a.red) * t),
        round(a.green + (b.green - a.green) * t),
        round(a.blue + (b.blue - a.blue) * t),
    )

# Map a Celsius reading onto the cyan -> purple -> orange spectrum.
def get_rgb_color_from_temp(temp_c: float) -> RGBColor:
    warmth = sanitize_range((temp_c - TEMP_C_MIN) / (TEMP_C_MAX - TEMP_C_MIN))
    if warmth < 0.5:
        return _lerp_color(COLOR_COLD, COLOR_MID, warmth / 0.5)
    return _lerp_color(COLOR_MID, COLOR_HOT, (warmth - 0.5) / 0.5)

# Return the latest temp_c from the backend, or None if not available yet.
def fetch_latest_temp_c(session: requests.Session) -> float | None:
    response = session.get(f"{BACKEND_URL}/readings/latest", timeout=REQUEST_TIMEOUT)
    if response.status_code == 404:
        return None  # backend is up but has no readings recorded yet
    
    response.raise_for_status()
    return response.json()["temp_c"]

def connect_openrgb() -> OpenRGBClient:
    # Block until the OpenRGB SDK server accepts a connection.
    while True:
        try:
            client = OpenRGBClient(
                address=OPENRGB_HOST, port=OPENRGB_PORT, name=OPENRGB_NAME
            )
            log(f"connected to OpenRGB SDK server at {OPENRGB_HOST}:{OPENRGB_PORT}")
            return client
        except Exception as exc:  # noqa: BLE001 - openrgb-python raises plain OSError/ConnectionError variants
            log(f"OpenRGB SDK server unavailable ({exc}); retrying in {RECONNECT_DELAY:.0f}s")
            time.sleep(RECONNECT_DELAY)

def main() -> None:
    log(
        f"starting; backend={BACKEND_URL} "
        f"openrgb={OPENRGB_HOST}:{OPENRGB_PORT} "
        f"range=[{TEMP_C_MIN:.1f}C, {TEMP_C_MAX:.1f}C]"
    )
    session = requests.Session()
    client: OpenRGBClient | None = None

    try:
        while True:
            if client is None:
                client = connect_openrgb()

            try:
                temp_c = fetch_latest_temp_c(session)
                if temp_c is not None:
                    color = get_rgb_color_from_temp(temp_c)
                    client.set_color(color)
                    log(f"temp={temp_c:.1f}C -> rgb=({color.red},{color.green},{color.blue})")
            except requests.RequestException as exc:
                log(f"backend unreachable ({exc})")
            except Exception as exc:  # noqa: BLE001 - covers OpenRGB socket drops mid-loop
                log(f"OpenRGB error ({exc}); will reconnect")
                client = None

            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        log("shutting down")


if __name__ == "__main__":
    main()
