"""Flint configuration — reads from .env via Pydantic BaseSettings."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # LLM
    anthropic_api_key: str = ""
    openai_api_key: str = "skip"
    llm_provider: Literal["claude", "openai", "ollama"] = "claude"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # Database
    database_url: str = "postgresql://postgres:flint@localhost:5432/flint"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Kafka
    kafka_bootstrap_servers: str = "localhost:9092"

    # App
    flint_api_key: str = ""  # Optional; blank = no auth required
    # OAuth (Google, GitHub). Set to enable "Sign in with Google/GitHub".
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    auth_redirect_base_url: str = ""  # Frontend URL for post-login redirect, e.g. https://flint-dashboard.vercel.app
    flint_env: Literal["development", "production"] = "development"
    flint_port: int = 8000
    flint_log_level: str = "INFO"
    flint_secret_key: str = "change-this-in-production"

    # Execution
    max_task_concurrency: int = 100
    default_task_timeout_seconds: int = 300
    max_retry_attempts: int = 5

    # WebSocket
    ws_heartbeat_interval: int = 30

    # Distributed tracing (OpenTelemetry). Optional; install [observability] extra.
    otel_enabled: bool = False
    otel_service_name: str = "flint"
    otel_exporter_otlp_endpoint: str = ""  # e.g. http://localhost:4317

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v

    @property
    def is_production(self) -> bool:
        return self.flint_env == "production"

    @property
    def asyncpg_dsn(self) -> str:
        """Convert postgresql:// to asyncpg-compatible DSN."""
        return self.database_url.replace("postgresql://", "postgresql://", 1)

    @property
    def sqlalchemy_async_url(self) -> str:
        """URL for SQLAlchemy async engine (postgresql+asyncpg://)."""
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
