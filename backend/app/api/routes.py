"""FastAPI route definitions for Milestone 1."""

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.database.connection import check_db_connection
from app.models.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["System"])
def health_check(settings: Settings = Depends(get_settings)) -> HealthResponse:
    """Check service, SQLite database, and AI configuration readiness."""
    db_ok = check_db_connection(settings.database_path)
    return HealthResponse(
        status="ok" if db_ok else "degraded",
        service=settings.app_name,
        database="connected" if db_ok else "disconnected",
        ai_configured=settings.is_ai_configured,
    )
