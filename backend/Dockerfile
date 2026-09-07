# FastAPI backend: serial reader (via the serial-bridge TCP socket) + SQLite + REST.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # The SQLite file lives on a mounted volume, never baked into the image.
    DB_PATH=/data/readings.db

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run as a non-root user that owns the data volume mountpoint.
RUN useradd --system --uid 1000 appuser \
    && mkdir -p /data \
    && chown -R appuser /data /app
USER appuser

EXPOSE 8000

# No curl in slim; use the stdlib for the healthcheck.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
