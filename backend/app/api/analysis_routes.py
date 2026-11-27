"""
PS6 Analysis API routes — analyze, clarify, resolve, and list conversations.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import Settings, get_settings
from app.models.schemas import AnalyzeRequest, AnalyzeResponse, ClarifyRequest, ResolveRequest
from app.services.conversation_service import (
    ConversationError,
    continue_conversation,
    get_resolved_intent,
    start_conversation,
)
from app.database import operations as db_ops

analysis_router = APIRouter(prefix="/api", tags=["PS6 Analysis"])


@analysis_router.post("/analyze", response_model=AnalyzeResponse, status_code=201)
def analyze(
    request: AnalyzeRequest,
    settings: Settings = Depends(get_settings),
) -> AnalyzeResponse:
    """
    Start a new conversation. Analyzes the instruction for ambiguity and returns
    clarification questions if needed, or a resolved intent if the instruction is clear.
    """
    try:
        return start_conversation(
            settings.database_path,
            instruction=request.instruction,
            context=request.context,
        )
    except ConversationError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")


@analysis_router.post("/clarify", response_model=AnalyzeResponse)
def clarify(
    request: ClarifyRequest,
    settings: Settings = Depends(get_settings),
) -> AnalyzeResponse:
    """
    Continue an existing conversation with a clarification response.
    Returns updated analysis or a resolved intent if now fully resolved.
    """
    try:
        return continue_conversation(
            settings.database_path,
            conversation_id=request.conversation_id,
            response=request.response,
        )
    except ConversationError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Clarification failed: {exc}")


@analysis_router.post("/resolve", response_model=AnalyzeResponse)
def resolve(
    request: ResolveRequest,
    settings: Settings = Depends(get_settings),
) -> AnalyzeResponse:
    """
    Retrieve the resolved intent for a completed conversation.
    Returns 409 if the conversation is not yet in RESOLVED state.
    """
    try:
        return get_resolved_intent(settings.database_path, request.conversation_id)
    except ConversationError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Resolution fetch failed: {exc}")


@analysis_router.get("/conversations")
def list_conversations(
    conversation_id: Optional[str] = Query(default=None, description="Fetch a single conversation by ID"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    List conversations (paginated) or fetch a single conversation by ID.
    When conversation_id is provided, returns full detail including messages and questions.
    """
    db_path = settings.database_path

    if conversation_id:
        conv = db_ops.get_conversation(db_path, conversation_id)
        if conv is None:
            raise HTTPException(status_code=404, detail=f"Conversation '{conversation_id}' not found.")

        # Fetch messages and questions for detail view
        from app.database.connection import get_connection

        with get_connection(db_path) as conn:
            messages = [
                dict(r)
                for r in conn.execute(
                    "SELECT role, content, turn_number, created_at FROM messages WHERE conversation_id = ? ORDER BY id;",
                    (conversation_id,),
                ).fetchall()
            ]
            questions = [
                dict(r)
                for r in conn.execute(
                    "SELECT question_text, answered, turn_number FROM clarification_questions WHERE conversation_id = ? ORDER BY id;",
                    (conversation_id,),
                ).fetchall()
            ]

        intent = db_ops.get_resolved_intent(db_path, conversation_id)

        return {
            "conversation": conv,
            "messages": messages,
            "clarification_questions": questions,
            "resolved_intent": intent,
        }

    conversations, total = db_ops.list_conversations(db_path, limit=limit, offset=offset)
    return {
        "conversations": conversations,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
