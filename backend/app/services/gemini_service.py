"""
Gemini AI service — structured output generation with retry, timeout, and validation.
All inventory data is injected by Python callers. Gemini never originates numbers.
"""

import json
from typing import Any, Optional, Type, TypeVar

import tenacity
from google import genai
from google.genai import types
from pydantic import BaseModel

from app.config import get_settings

T = TypeVar("T", bound=BaseModel)

_client: Optional[genai.Client] = None
_client_config: Optional[tuple[str, int]] = None


def _get_client() -> genai.Client:
    global _client, _client_config
    settings = get_settings()
    api_key = settings.gemini_api_key.strip()
    if not api_key or api_key == "your_gemini_api_key_here":
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. Set it in backend/.env to enable AI features."
        )
    desired_config = (api_key, settings.gemini_timeout_seconds)
    if _client is None or _client_config != desired_config:
        _client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=settings.gemini_timeout_seconds * 1000),
        )
        _client_config = desired_config
    return _client


@tenacity.retry(
    retry=tenacity.retry_if_exception(lambda exc: not isinstance(exc, RuntimeError)),
    stop=tenacity.stop_after_attempt(2),
    wait=tenacity.wait_fixed(1),
    reraise=True,
)
def _call_gemini(
    prompt: str,
    response_schema: Type[T],
    temperature: float = 0.1,
) -> T:
    """Call Gemini with structured JSON output and Pydantic validation."""
    settings = get_settings()
    client = _get_client()
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_schema,
            temperature=temperature,
        ),
    )
    parsed = response.parsed
    if parsed is None:
        raise ValueError("Gemini returned empty or unparseable response.")
    return parsed


def call_gemini_structured(
    prompt: str,
    response_schema: Type[T],
    temperature: float = 0.1,
) -> tuple[T, None] | tuple[None, str]:
    """
    Safe wrapper: returns (result, None) on success, (None, error_message) on failure.
    Callers must handle the error case with deterministic fallbacks.
    """
    try:
        result = _call_gemini(prompt, response_schema, temperature)
        return result, None
    except RuntimeError as exc:
        return None, str(exc)
    except Exception as exc:
        return None, f"Gemini API error: {exc}"


def call_gemini_text(prompt: str, temperature: float = 0.3) -> tuple[str, None] | tuple[None, str]:
    """Call Gemini for plain-text explanation (no structured schema)."""
    try:
        settings = get_settings()
        client = _get_client()
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=temperature),
        )
        text = response.text or ""
        if not text.strip():
            return None, "Gemini returned empty text."
        return text.strip(), None
    except RuntimeError as exc:
        return None, str(exc)
    except Exception as exc:
        return None, f"Gemini API error: {exc}"
