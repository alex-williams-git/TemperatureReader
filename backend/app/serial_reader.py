"""Background thread that reads JSON lines from the Arduino and stores them.

Design notes:
- One blocking `readline()` loop on a daemon thread. pyserial is blocking;
  the DHT11 emits ~one line / 2s, so a thread is the natural fit (no asyncio).
- `serial_for_url` (not `Serial`) so SERIAL_PORT accepts either a local device
  ("COM3", "/dev/ttyACM0") or a URL ("socket://host.docker.internal:9600").
  The URL form is how the Dockerized backend reaches the Windows-side
  serial-bridge; pyserial raises SerialException on socket loss just like a
  real unplug, so the reconnect loop below covers both.
- Resilient to the device (or bridge socket) disappearing: on SerialException
  it drops the connection, waits, and retries forever until stop() is called.
- Tolerates garbage: the line right after a board reset is often partial or
  noisy. Non-JSON lines are skipped. `{"error": ...}` lines are recorded but
  not stored as readings (one parse path, matching the CLAUDE.md contract).
  (pyserial also flushes the socket's input buffer on open, so the first line
  after each `socket://` (re)connect is typically dropped — harmless here.)
"""
import json
import logging
import threading
from datetime import datetime, timezone

import serial

from .config import settings
from .db import insert_reading

log = logging.getLogger("serial_reader")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class SerialReader:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.connected: bool = False
        self.last_error: str | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="serial-reader", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=settings.serial_read_timeout + 2)
        self.connected = False

    # -- internals -----------------------------------------------------------

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                with serial.serial_for_url(
                    settings.serial_port,
                    baudrate=settings.serial_baud,
                    timeout=settings.serial_read_timeout,
                ) as ser:
                    self.connected = True
                    self.last_error = None
                    log.info(
                        "Serial connected: %s @ %d baud",
                        settings.serial_port,
                        settings.serial_baud,
                    )
                    self._read_loop(ser)
            except serial.SerialException as exc:
                self.connected = False
                self.last_error = str(exc)
                log.warning(
                    "Serial unavailable (%s); retrying in %.0fs",
                    exc,
                    settings.serial_reconnect_delay,
                )
                self._stop.wait(settings.serial_reconnect_delay)
        self.connected = False
        log.info("Serial reader stopped")

    def _read_loop(self, ser: serial.Serial) -> None:
        while not self._stop.is_set():
            raw = ser.readline()
            if not raw:
                continue  # read timeout, no data — loop so we can check _stop

            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                log.debug("Skipping non-JSON serial line: %r", line)
                continue

            if "error" in data:
                self.last_error = str(data["error"])
                log.warning("Sensor error: %s", data["error"])
                continue

            try:
                insert_reading(
                    ts=_utc_now_iso(),
                    temp_c=float(data["temp_c"]),
                    temp_f=float(data["temp_f"]),
                    humidity=float(data["humidity"]),
                )
                self.last_error = None
            except (KeyError, TypeError, ValueError) as exc:
                log.warning("Malformed reading %r: %s", data, exc)
