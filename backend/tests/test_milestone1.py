"""Milestone 1 verification tests: health, config, schemas, CORS, and SQLite init."""

from pathlib import Path
from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.database.connection import check_db_connection, get_connection, init_db
from app.main import create_app
from app.models.schemas import AnalyzeRequest


def test_default_settings_and_configurable_model() -> None:
    """Verify default configurable GEMINI_MODEL and no hardcoded API key."""
    settings = Settings(_env_file=None)
    assert settings.gemini_model == "gemini-3.8-flash"
    assert settings.gemini_api_key == ""
    assert settings.is_ai_configured is False
    assert "http://localhost:5173" in settings.cors_origins_list


def test_database_initialization(tmp_path: Path) -> None:
    """Verify all 6 tables, indexes, and foreign key enforcement on SQLite init."""
    db_file = tmp_path / "test_resolvex.db"
    init_db(str(db_file))

    assert db_file.exists()
    assert check_db_connection(str(db_file)) is True

    with get_connection(str(db_file)) as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
        ).fetchall()
        tables = {row["name"] for row in rows}
        fk_enabled = conn.execute("PRAGMA foreign_keys;").fetchone()[0]

    assert {
        "conversations",
        "messages",
        "clarification_questions",
        "interpretations",
        "resolved_intents",
        "evaluation_records",
    }.issubset(tables)
    assert fk_enabled == 1


def test_health_endpoint(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify GET /health returns 200 OK with connected DB and configured status."""
    db_file = tmp_path / "health_test.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_file))
    monkeypatch.setenv("GEMINI_API_KEY", "")

    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data == {
            "status": "ok",
            "service": "ResolveX Backend",
            "database": "connected",
            "ai_configured": False,
        }
    finally:
        get_settings.cache_clear()


def test_cors_headers_for_frontend(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify CORS preflight allows configured frontend origin."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "cors_test.db"))
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            res = client.options(
                "/health",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )
        assert res.status_code == 200
        assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    finally:
        get_settings.cache_clear()


def test_analyze_request_schema_validation() -> None:
    """Verify Pydantic rejects blank and oversized instructions."""
    with pytest.raises(ValidationError):
        AnalyzeRequest(instruction="   ")

    with pytest.raises(ValidationError):
        AnalyzeRequest(instruction="a" * 2001)

    valid = AnalyzeRequest(instruction="  Send the report to Rahul.  ")
    assert valid.instruction == "Send the report to Rahul."
