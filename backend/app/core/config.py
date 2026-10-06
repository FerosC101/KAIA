"""Application settings, loaded from environment variables / .env."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_name: str = "KAIA Platform API"
    environment: str = Field(default="development", description="development | staging | production")
    api_prefix: str = "/api"

    database_url: str = "postgresql+psycopg://kaia:kaia@localhost:5432/kaia"

    # Security
    jwt_secret: str = "change-me-dev-only-jwt-secret-please-rotate-0123456789"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    # Fernet key (urlsafe base64, 32 bytes). Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    field_encryption_key: str = "q6Qp2hZ0mX1yqvJt7m0p3m2Qh9mYlq3o2l5a0bJzRkE="
    file_url_secret: str = "change-me-dev-only-file-url-secret"
    file_url_ttl_seconds: int = 300
    cookie_secure: bool = False  # set true behind HTTPS
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    public_app_url: str = "http://localhost:5173"
    timezone: str = "Asia/Manila"
    login_rate_limit_per_5min: int = 10

    # Storage
    storage_backend: str = "local"  # local | s3 (interface ready, see services/storage.py)
    media_root: str = "./media"

    # Simulation
    reader_stage_seconds: float = 1.4
    enable_demo_endpoints: bool = True

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
