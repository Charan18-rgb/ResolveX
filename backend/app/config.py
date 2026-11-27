"""Application configuration loaded from environment variables and .env."""

from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the ResolveX backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ResolveX Backend"
    app_env: str = "development"
    debug: bool = False

    # Gemini settings (no hardcoded key; model is configurable)
    gemini_api_key: str = Field(default="")
    gemini_model: str = Field(default="gemini-3.8-flash")
    gemini_timeout_seconds: int = Field(default=15, ge=1, le=120)

    # SQLite database path
    database_path: str = Field(default="resolvex.db")

    # Conversation limits
    max_clarification_turns: int = Field(default=3, ge=1, le=10)

    # CORS origins (comma-separated string in .env)
    allowed_origins: str = Field(
        default="http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a clean list."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def is_ai_configured(self) -> bool:
        """Return True if a non-placeholder Gemini API key is configured."""
        key = self.gemini_api_key.strip()
        return bool(key) and key != "your_gemini_api_key_here"


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
