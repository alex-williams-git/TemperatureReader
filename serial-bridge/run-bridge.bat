@echo off
REM Bridges the Arduino's COM port to TCP so the backend container can read it.
REM Keep this running (leave the window open, or register it with Task
REM Scheduler at logon) whenever the docker compose stack is up.
REM
REM Override the defaults by setting these before running, e.g.:
REM   set BRIDGE_SERIAL_PORT=COM4

cd /d "%~dp0"

if not defined BRIDGE_SERIAL_PORT set BRIDGE_SERIAL_PORT=COM3
if not defined BRIDGE_LISTEN_PORT set BRIDGE_LISTEN_PORT=9600

REM Reuse the backend's virtualenv if it exists (it already has pyserial);
REM otherwise fall back to the system Python on PATH.
if exist "..\backend\.venv\Scripts\python.exe" (
  "..\backend\.venv\Scripts\python.exe" bridge.py
) else (
  python bridge.py
)
