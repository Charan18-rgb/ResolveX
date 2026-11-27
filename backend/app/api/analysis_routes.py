"""
Analysis API routes — analyze, clarify, resolve, and list conversations.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

logger = logging.getLogger(__name__)

from app.config import Settings, get_settings
from app.models.schemas import AnalyzeRequest, AnalyzeResponse, ClarifyRequest, ResolveRequest
from app.services.conversation_service import (
    ConversationError,
    continue_conversation,
    get_resolved_intent,
    start_conversation,
)
from app.database import operations as db_ops

analysis_router = APIRouter(prefix="/api", tags=["Analysis"])


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
    except Exception:
        logger.exception("Analysis failed for instruction")
        raise HTTPException(status_code=500, detail="Analysis failed. Please try again.")


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
            max_turns=settings.max_clarification_turns,
        )
    except ConversationError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc))
    except Exception:
        logger.exception("Clarification failed for conversation %s", request.conversation_id)
        raise HTTPException(status_code=500, detail="Clarification failed. Please try again.")


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
    except Exception:
        logger.exception("Resolution fetch failed for conversation %s", request.conversation_id)
        raise HTTPException(status_code=500, detail="Resolution fetch failed. Please try again.")


@analysis_router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Delete a conversation and all of its messages, questions and intents."""
    try:
        deleted = db_ops.delete_conversation(settings.database_path, conversation_id)
    except Exception:
        logger.exception("Delete conversation failed for %s", conversation_id)
        raise HTTPException(status_code=500, detail="Delete failed. Please try again.")
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"deleted": True, "conversation_id": conversation_id}


@analysis_router.patch("/conversations/{conversation_id}")
def rename_conversation(
    conversation_id: str,
    body: dict,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Rename a conversation's displayed title."""
    title = str(body.get("title", "")).strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required.")
    try:
        renamed = db_ops.rename_conversation(settings.database_path, conversation_id, title)
    except Exception:
        logger.exception("Rename conversation failed for %s", conversation_id)
        raise HTTPException(status_code=500, detail="Rename failed. Please try again.")
    if not renamed:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"renamed": True, "conversation_id": conversation_id, "title": title[:200]}


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
        confidence_history, confidence_assessment = db_ops.get_confidence_history(
            db_path, conversation_id
        )
        from app.core.context_analyzer import build_session_memory_bundle

        session_memory, _, _, _ = build_session_memory_bundle(db_path, conversation_id)
        from app.core.risk_engine import evaluate_intent_risk

        user_msgs = [m["content"] for m in messages if m.get("role") == "user"]
        raw_combined = " ".join(user_msgs)
        risk_assessment = evaluate_intent_risk(
            action=intent["action"] if intent else "unresolved_action",
            target=intent["resolved_instruction"] if intent else (user_msgs[0] if user_msgs else ""),
            raw_text=raw_combined,
            unresolved_questions_count=len([q for q in questions if not q.get("answered")]),
            has_conflicts=bool(session_memory.reference_conflicts),
            user_confirmed=conv.get("status") == "RESOLVED",
        )

        return {
            "conversation": conv,
            "messages": messages,
            "clarification_questions": questions,
            "resolved_intent": intent,
            "confidence_assessment": confidence_assessment,
            "confidence_history": confidence_history,
            "context_memory": session_memory.model_dump(),
            "risk_assessment": risk_assessment.model_dump(),
        }

    conversations, total = db_ops.list_conversations(db_path, limit=limit, offset=offset)
    return {
        "conversations": conversations,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
