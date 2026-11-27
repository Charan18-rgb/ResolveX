"""Application configuration loaded from environment variables and .env."""

from functools import lru_cache
from pydantic import Field, field_validator
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
    gemini_fallback_model: str = Field(default="gemini-3.5-flash")
    gemini_timeout_seconds: int = Field(default=15, ge=1, le=120)

    # SQLite database path
    database_path: str = Field(default="resolvex.db")

    # Conversation limits
    max_clarification_turns: int = Field(default=3, ge=1, le=10)

    # Gmail integration (optional — email stays draft-only until configured)
    google_client_id: str = Field(default="")
    google_client_secret: str = Field(default="")
    google_redirect_uri: str = Field(default="http://localhost:8000/api/email/oauth/callback")
    gmail_sender: str = Field(default="")
    gmail_refresh_token: str = Field(default="")

    # CORS origins (comma-separated string in .env)
    allowed_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"
    )

    @field_validator("gemini_model", "database_path")
    @classmethod
    def must_not_be_blank(cls, value: str) -> str:
        """Ensure critical configuration strings are non-empty."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("Configuration value must not be empty.")
        return stripped

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a clean list (always allow Vite dev port 8080 in dev)."""
        origins = [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]
        if self.app_env == "development":
            for dev_origin in ("http://localhost:8080", "http://127.0.0.1:8080"):
                if dev_origin not in origins:
                    origins.append(dev_origin)
        return origins

    @property
    def is_ai_configured(self) -> bool:
        """Return True if a non-placeholder Gemini API key is configured."""
        key = self.gemini_api_key.strip()
        return bool(key) and key != "your_gemini_api_key_here"

    def require_gemini_api_key(self) -> str:
        """Return the configured Gemini API key or raise a clear configuration error."""
        if not self.is_ai_configured:
            raise ValueError(
                "GEMINI_API_KEY is missing or using the placeholder value. "
                "Set a valid GEMINI_API_KEY in backend/.env or environment variables."
            )
        return self.gemini_api_key.strip()


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
