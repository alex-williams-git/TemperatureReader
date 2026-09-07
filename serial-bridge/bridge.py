"""COM-port -> TCP bridge, so a container can read the Arduino on Windows.

Why this exists
---------------
Docker Desktop on Windows runs containers inside a WSL2 Linux VM. A Windows
``COM3`` handle cannot be passed into that VM -- the ``devices:`` mapping in
docker-compose only works when the Docker host is itself Linux. So the serial
link has to be crossed *before* Docker: this script runs natively on Windows,
holds the COM port open, and re-exposes the raw byte stream on a TCP socket.

The backend container then connects with pyserial's built-in
``socket://host.docker.internal:9600`` URL and behaves exactly as if it had
opened the port directly -- same ``readline()`` loop, same reconnect logic.

Why threads (not select())
--------------------------
``select()`` / non-blocking polling does not work on Windows serial handles,
so the serial port and the TCP socket can't be multiplexed in one loop.
Instead a dedicated thread does the blocking ``Serial.readline()`` and pushes
each line to whichever TCP client is currently connected; the main thread just
accepts connections and notices when a client goes away.

Only one client at a time (the backend). A new connection replaces the old.
When the physical port disappears (USB unplugged) the client socket is closed
too, so the backend's ``/health`` correctly flips to "serial disconnected".

Config (environment variables, all optional):
    BRIDGE_SERIAL_PORT     default COM3
    BRIDGE_BAUD            default 9600   (must match the Arduino sketch)
    BRIDGE_LISTEN_HOST     default 0.0.0.0
    BRIDGE_LISTEN_PORT     default 9600
    BRIDGE_RECONNECT_DELAY default 3.0    (seconds between serial reopen tries)
"""
from __future__ import annotations

import os
import socket
import threading
import time

import serial

SERIAL_PORT = os.environ.get("BRIDGE_SERIAL_PORT", "COM3")
BAUD = int(os.environ.get("BRIDGE_BAUD", "9600"))
LISTEN_HOST = os.environ.get("BRIDGE_LISTEN_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("BRIDGE_LISTEN_PORT", "9600"))
RECONNECT_DELAY = float(os.environ.get("BRIDGE_RECONNECT_DELAY", "3.0"))
READ_TIMEOUT = 5.0  # bounds how fast the serial thread notices `stop`


def log(msg: str) -> None:
    print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} bridge: {msg}", flush=True)


class ClientHolder:
    """The single currently-connected TCP client, safe for cross-thread use.

    The main thread swaps the client in/out; the serial thread only ever sends
    to it. All access goes through the lock.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sock: socket.socket | None = None

    def set(self, sock: socket.socket) -> None:
        with self._lock:
            old, self._sock = self._sock, sock
        _quiet_close(old, unless=sock)

    def clear_if(self, sock: socket.socket) -> None:
        """Drop `sock` only if it is still the current client."""
        with self._lock:
            drop = sock if self._sock is sock else None
            if drop is not None:
                self._sock = None
        _quiet_close(drop)

    def close_current(self) -> None:
        with self._lock:
            drop, self._sock = self._sock, None
        _quiet_close(drop)

    def send(self, data: bytes) -> None:
        with self._lock:
            sock = self._sock
        if sock is None:
            return
        try:
            sock.sendall(data)
        except OSError as exc:
            log(f"client send failed ({exc}); dropping client")
            self.clear_if(sock)


def _quiet_close(sock: socket.socket | None, unless: socket.socket | None = None) -> None:
    if sock is not None and sock is not unless:
        try:
            sock.close()
        except OSError:
            pass


def serial_pump(client: ClientHolder, stop: threading.Event) -> None:
    """Forever: hold the serial port open and forward each line to the client."""
    while not stop.is_set():
        try:
            with serial.Serial(SERIAL_PORT, BAUD, timeout=READ_TIMEOUT) as ser:
                log(f"serial open: {SERIAL_PORT} @ {BAUD} baud")
                while not stop.is_set():
                    data = ser.readline()
                    if data:
                        client.send(data)
        except serial.SerialException as exc:
            # The port vanished (unplug / driver reset). Drop the TCP client so
            # the backend reconnects and reports the outage, then retry.
            log(f"serial unavailable ({exc}); retrying in {RECONNECT_DELAY:.0f}s")
            client.close_current()
            stop.wait(RECONNECT_DELAY)


def main() -> None:
    stop = threading.Event()
    client = ClientHolder()

    pump = threading.Thread(target=serial_pump, args=(client, stop), daemon=True)
    pump.start()

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((LISTEN_HOST, LISTEN_PORT))
    srv.listen(1)
    log(f"listening on {LISTEN_HOST}:{LISTEN_PORT} (serial source: {SERIAL_PORT})")

    try:
        while True:
            conn, addr = srv.accept()
            conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            log(f"client connected: {addr[0]}:{addr[1]}")
            client.set(conn)
            # Read from the client only to detect disconnect. Anything it sends
            # is discarded -- the Arduino sketch ignores serial input.
            try:
                while conn.recv(1024):
                    pass
            except OSError:
                pass
            finally:
                log("client disconnected")
                client.clear_if(conn)
    except KeyboardInterrupt:
        log("shutting down")
    finally:
        stop.set()
        client.close_current()
        srv.close()


if __name__ == "__main__":
    main()
