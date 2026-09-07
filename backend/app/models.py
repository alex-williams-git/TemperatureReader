"""Pydantic response models — the API's public shape."""
from pydantic import BaseModel


class Reading(BaseModel):
    id: int
    ts: str
    temp_c: float
    temp_f: float
    humidity: float


class Health(BaseModel):
    status: str
    serial_connected: bool
    serial_last_error: str | None
    last_reading_ts: str | None
    total_readings: int
