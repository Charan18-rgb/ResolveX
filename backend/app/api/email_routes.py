"""Email integration API — status, OAuth start, and confirmed send.

Sending always requires an explicit `confirm: true` flag and returns the
provider's real result. Nothing is reported as sent unless Gmail accepts it.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.services import email_service

logger = logging.getLogger(__name__)

email_router = APIRouter(prefix="/api/email", tags=["Email"])


class SendEmailRequest(BaseModel):
    to: str = Field(min_length=3, max_length=320)
    subject: str = Field(default="", max_length=300)
    body: str = Field(default="", max_length=20000)
    confirm: bool = Field(default=False, description="Must be true to actually send")


@email_router.get("/status")
def get_email_status(settings: Settings = Depends(get_settings)) -> dict:
    return email_service.email_status(settings)


@email_router.get("/oauth/start")
def oauth_start(settings: Settings = Depends(get_settings)) -> dict:
    url = email_service.oauth_authorize_url(settings)
    if url is None:
        raise HTTPException(
            status_code=501,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )
    return {"authorize_url": url}


@email_router.post("/send")
def send_email(body: SendEmailRequest, settings: Settings = Depends(get_settings)) -> dict:
    if not body.confirm:
        raise HTTPException(
            status_code=400,
            detail="Explicit confirmation is required before sending an email. Set confirm=true.",
        )
    if "@" not in body.to:
        raise HTTPException(status_code=422, detail="A valid recipient email address is required.")
    result = email_service.send_email(
        settings, to=body.to.strip(), subject=body.subject, body=body.body
    )
    if not result.get("sent") and result.get("configured"):
        # Provider reachable but rejected — surface as 502 so callers see failure.
        raise HTTPException(status_code=502, detail=result.get("error", "Send failed."))
    return result
