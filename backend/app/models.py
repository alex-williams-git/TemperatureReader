"""Pydantic response models — the API's public shape."""
from pydantic import BaseModel


class Reading(BaseModel):
    id: int
    ts: str
    temp_c: float
    temp_f: float
    humidity: float


class AggregateBucket(BaseModel):
    bucket_start: str  # UTC ISO-8601, the left edge of the bucket
    count: int
    temp_c_avg: float
    temp_c_min: float
    temp_c_max: float
    temp_f_avg: float
    temp_f_min: float
    temp_f_max: float
    humidity_avg: float
    humidity_min: float
    humidity_max: float


class Health(BaseModel):
    status: str
    serial_connected: bool
    serial_last_error: str | None
    last_reading_ts: str | None
    total_readings: int

class WeeklySummary(BaseModel):
    readings: int
    avg_temp_c: float
    avg_temp_f: float
    percent_in_low: float
    percent_in_medium: float
    percent_in_high: float