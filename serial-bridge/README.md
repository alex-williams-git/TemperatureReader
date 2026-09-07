# serial-bridge — COM port → TCP

A tiny native Windows helper that reads the Arduino's serial port and
re-exposes the byte stream on a TCP socket, so the **backend running in Docker
can reach it**.

## Why this is needed

Docker Desktop on Windows runs containers inside a WSL2 Linux VM. A Windows
`COM3` handle can't be handed to that VM — the `devices:` mapping in
`docker-compose.yml` only works when the Docker host is itself Linux. So the
serial link has to be bridged *outside* Docker.

```
[Arduino] --USB--> COM3 --> [bridge.py on Windows] --TCP :9600--> [backend container]
                                                                   SERIAL_PORT=
                                                                   socket://host.docker.internal:9600
```

`bridge.py` just forwards bytes. The backend connects with pyserial's built-in
`socket://` URL handler and runs its normal `readline()` + auto-reconnect loop,
unchanged. When the Arduino is unplugged the bridge drops the TCP client, so
the backend's `/health` still reports `serial_connected: false` correctly.

## Running it

Double-click **`run-bridge.bat`**, or from a terminal:

```powershell
cd serial-bridge
# reuses ..\backend\.venv if present; otherwise:
python -m pip install -r requirements.txt
python bridge.py
```

Leave it running while `docker compose up` is up. Only one process can hold the
COM port — close any PlatformIO / Arduino IDE **Serial Monitor** first.

### Start it automatically at logon (so you never think about it)

Task Scheduler → Create Task:

- **Trigger:** At log on
- **Action:** Start a program → `C:\WorkingFiles\TemperatureReader\serial-bridge\run-bridge.bat`
- **Settings:** "Run whether user is logged on or not" is *not* needed; the
  bridge only needs the desktop session that owns the USB device.

## Config (environment variables, all optional)

| Var | Default | Notes |
|---|---|---|
| `BRIDGE_SERIAL_PORT` | `COM3` | the Uno's port |
| `BRIDGE_BAUD` | `9600` | must match the Arduino sketch |
| `BRIDGE_LISTEN_HOST` | `0.0.0.0` | listen on all interfaces so the container can connect |
| `BRIDGE_LISTEN_PORT` | `9600` | must match the port in `SERIAL_PORT` in compose |
| `BRIDGE_RECONNECT_DELAY` | `3.0` | seconds between attempts to reopen a lost port |

## Verifying

With the bridge running and the Arduino connected:

```powershell
# raw stream — you should see one JSON line every ~2s
python -c "import socket;s=socket.create_connection(('localhost',9600));print(s.recv(500))"
```

Or once the stack is up: `curl http://localhost:8000/health` →
`serial_connected: true`.
