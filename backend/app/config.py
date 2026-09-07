"""Runtime configuration, read from environment (or a local .env file).

Nothing sensor- or host-specific is hardcoded: SERIAL_PORT in particular
differs between Windows (COM3), bare Linux (/dev/ttyUSB0) and Docker.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Serial
    serial_port: str = "COM3"
    serial_baud: int = 9600
    serial_read_timeout: float = 5.0   # seconds; also bounds shutdown latency
    serial_reconnect_delay: float = 3.0

    # Database
    db_path: str = "./data/readings.db"

    # CORS — comma-separated origins allowed to call the API
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
