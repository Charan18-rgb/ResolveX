"""Email provider integration.

Architecture: NLU interpretation (recipient/subject/body extraction) lives in
communication_parser; this module is the provider-execution boundary only.
Nothing is reported as sent unless the provider API confirms acceptance.

Gmail path: OAuth2 refresh-token exchange -> Gmail API messages.send.
When GOOGLE_CLIENT_ID / gmail credentials are absent the service reports
configured=False and every send returns an honest failure — never simulated.
"""

from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from typing import Any, Optional

from app.config import Settings

logger = logging.getLogger(__name__)

_GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


def _post_json(url: str, payload: dict[str, Any], timeout: int = 15) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _refresh_access_token(settings: Settings) -> Optional[str]:
    """Exchange the stored refresh token for a short-lived access token."""
    if not settings.gmail_refresh_token or not settings.google_client_id:
        return None
    try:
        data = urllib.parse.urlencode(
            {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": settings.gmail_refresh_token,
                "grant_type": "refresh_token",
            }
        ).encode("utf-8")
        req = urllib.request.Request(_TOKEN_URL, data=data, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return body.get("access_token")
    except Exception:
        logger.exception("Gmail token refresh failed")
        return None


def email_status(settings: Settings) -> dict[str, Any]:
    """Connection status — truthful about what is actually configured."""
    oauth_ready = bool(settings.google_client_id and settings.google_client_secret)
    connected = bool(settings.gmail_sender and settings.gmail_refresh_token)
    return {
        "provider": "gmail",
        "configured": oauth_ready and connected,
        "oauth_ready": oauth_ready,
        "connected": connected,
        "sender": settings.gmail_sender or None,
        "scopes": [_GMAIL_SEND_SCOPE] if connected else [],
        "note": (
            "Gmail connected."
            if connected
            else "Gmail is not connected. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "
            "GMAIL_SENDER and GMAIL_REFRESH_TOKEN in backend/.env to enable sending. "
            "Drafts remain available regardless."
        ),
    }


def oauth_authorize_url(settings: Settings, state: str = "") -> Optional[str]:
    """Build the Google consent URL, or None when OAuth is not configured."""
    if not settings.google_client_id:
        return None
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": _GMAIL_SEND_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    if state:
        params["state"] = state
    return f"{_OAUTH_AUTH_URL}?{urllib.parse.urlencode(params)}"


def send_email(
    settings: Settings,
    *,
    to: str,
    subject: str,
    body: str,
) -> dict[str, Any]:
    """Send an email through Gmail. Returns provider-confirmed status only."""
    status = email_status(settings)
    if not status["connected"]:
        return {
            "sent": False,
            "configured": False,
            "provider": "gmail",
            "error": "Gmail is not connected. No message was sent.",
        }

    token = _refresh_access_token(settings)
    if not token:
        return {
            "sent": False,
            "configured": True,
            "provider": "gmail",
            "error": "Could not obtain a Gmail access token (revoked or expired credentials). No message was sent.",
        }

    msg = EmailMessage()
    msg["To"] = to
    msg["From"] = settings.gmail_sender
    msg["Subject"] = subject or "(no subject)"
    msg.set_content(body or "")
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

    req = urllib.request.Request(
        _GMAIL_SEND_URL,
        data=json.dumps({"raw": raw}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        logger.warning("Gmail send failed: %s %s", exc.code, detail)
        return {
            "sent": False,
            "configured": True,
            "provider": "gmail",
            "error": f"Gmail API rejected the message (HTTP {exc.code}). No message was sent.",
        }
    except Exception:
        logger.exception("Gmail send request failed")
        return {
            "sent": False,
            "configured": True,
            "provider": "gmail",
            "error": "Network error contacting Gmail. No message was sent.",
        }

    message_id = payload.get("id")
    if not message_id:
        return {
            "sent": False,
            "configured": True,
            "provider": "gmail",
            "error": "Gmail response did not confirm acceptance. Treating as not sent.",
        }
    return {
        "sent": True,
        "configured": True,
        "provider": "gmail",
        "message_id": message_id,
        "thread_id": payload.get("threadId"),
        "sender": settings.gmail_sender,
    }
