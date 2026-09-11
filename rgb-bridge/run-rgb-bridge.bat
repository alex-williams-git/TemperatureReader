@echo off

REM Runs the rgb-bridge: polls the backend for the latest temp and pushes a
REM blue-to-red color to OpenRGB. Requires the OpenRGB app to be running
REM locally with its SDK server enabled (Settings -> SDK Server -> Enable).

cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" rgb_bridge_main.py
) else (
  python rgb_bridge_main.py
)