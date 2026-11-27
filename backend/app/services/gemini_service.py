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


def _is_transient_model_error(exc: Exception) -> bool:
    msg = str(exc).upper()
    return any(
        code in msg
        for code in ("503", "504", "429", "UNAVAILABLE", "DEADLINE_EXCEEDED", "NOT_FOUND", "RESOURCE_EXHAUSTED")
    )


def _should_retry_call(exc: BaseException) -> bool:
    """Only retry unexpected transport hiccups, not auth/quota/unavailable errors."""
    if isinstance(exc, RuntimeError):
        return False
    msg = str(exc).upper()
    if any(code in msg for code in ("400", "401", "403", "404", "429", "503", "504", "API_KEY_INVALID")):
        return False
    return True


@tenacity.retry(
    retry=tenacity.retry_if_exception(_should_retry_call),
    stop=tenacity.stop_after_attempt(2),
    wait=tenacity.wait_fixed(1),
    reraise=True,
)
def _call_gemini(
    prompt: str,
    response_schema: Type[T],
    temperature: float = 0.1,
    model_name: Optional[str] = None,
) -> T:
    """Call Gemini with structured JSON output and Pydantic validation."""
    settings = get_settings()
    client = _get_client()
    response = client.models.generate_content(
        model=model_name or settings.gemini_model,
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


def _candidate_models() -> list[str]:
    settings = get_settings()
    candidates = [
        settings.gemini_model,
        settings.gemini_fallback_model,
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
    ]
    seen: list[str] = []
    for m in candidates:
        cleaned = (m or "").strip()
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return seen


def call_gemini_structured(
    prompt: str,
    response_schema: Type[T],
    temperature: float = 0.1,
) -> tuple[T, None] | tuple[None, str]:
    """
    Safe wrapper: returns (result, None) on success, (None, error_message) on failure.
    If the primary model hits a transient 503/504/404/429 availability/quota issue,
    cascades through configured fallback models before returning deterministic fallback.
    """
    last_error = ""
    for idx, model_name in enumerate(_candidate_models()):
        try:
            result = _call_gemini(prompt, response_schema, temperature, model_name)
            return result, None
        except RuntimeError as exc:
            return None, str(exc)
        except Exception as exc:
            last_error = f"Gemini API error ({model_name}): {exc}"
            if idx == 0 and not _is_transient_model_error(exc):
                return None, last_error
            if not _is_transient_model_error(exc):
                return None, last_error
    return None, last_error


def call_gemini_text(prompt: str, temperature: float = 0.3) -> tuple[str, None] | tuple[None, str]:
    """Call Gemini for plain-text explanation (no structured schema)."""
    last_error = ""
    for model_name in _candidate_models():
        try:
            client = _get_client()
            response = client.models.generate_content(
                model=model_name,
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
            last_error = f"Gemini API error ({model_name}): {exc}"
            if not _is_transient_model_error(exc):
                return None, last_error
    return None, last_error
