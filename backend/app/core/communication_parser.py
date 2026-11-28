"""Structured natural-language understanding for communication intents.

Uses Gemini structured interpretation when configured, with a deterministic
fallback that handles relationships, possessives, pronouns and spelling.
"""

import re
from typing import Any, Optional

from pydantic import BaseModel, Field

_RELATIONSHIPS = {
    "classmate", "class mate", "friend", "manager", "supplier", "colleague",
    "boss", "client", "teacher", "student", "partner", "employee", "vendor",
    "accountant", "driver", "owner", "director", "team", "group",
}

_NAME_STOPWORDS = {
    "that", "this", "tomorrow", "today", "yesterday", "class", "college",
    "payment", "stock", "message", "email", "reminder", "please", "the",
    "and", "for", "with", "will", "would", "about", "regards", "sir", "madam",
}

_SPELLING_FIXES = {
    "comming": "coming", "colege": "college", "tommorow": "tomorrow",
    "tommorrow": "tomorrow", "recieve": "receive", "seperate": "separate",
    "definately": "definitely", "occured": "occurred", "untill": "until",
    "wich": "which", "thier": "their", "becuase": "because", "adress": "address",
    "attendence": "attendance", "abscent": "absent", "tomorow": "tomorrow",
}

_PRONOUNS = {"he", "him", "his", "she", "her", "they", "them", "it", "this", "that", "those"}


class CommunicationIntent(BaseModel):
    """Structured interpretation of a send/message/remind request."""

    action: str = Field(description="email | message | reminder | notify")
    recipient_name: Optional[str] = Field(default=None, description="Person's name only, no relationship words")
    relationship: Optional[str] = Field(default=None, description="e.g. classmate, friend, manager, supplier")
    recipient_description: Optional[str] = Field(default=None, description="Full recipient phrase e.g. 'Charan's classmate'")
    message: str = Field(description="The message content, spelling-corrected")
    subject: Optional[str] = Field(default=None)
    tone: str = "standard"
    confidence: float = 0.5
    requires_recipient_confirmation: bool = False
    requires_clarification: bool = False
    clarification_question: Optional[str] = None


def _fix_spelling(text: str) -> str:
    words = text.split()
    return " ".join(_SPELLING_FIXES.get(w.strip(".,!?").lower(), w) if w.strip(".,!?").lower() in _SPELLING_FIXES else w for w in words)


def _looks_like_name(token: str) -> bool:
    t = token.strip(".,!?")
    return bool(t) and t[0].isupper() and t.lower() not in _NAME_STOPWORDS and len(t) > 1


def _extract_names(text: str) -> list[str]:
    """Pull capitalized name candidates, stopping before stopwords/verbs."""
    import re
    names: list[str] = []
    for m in re.finditer(r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b", text):
        phrase = m.group(1)
        parts = [p for p in phrase.split() if _looks_like_name(p)]
        if parts:
            names.append(" ".join(parts))
    return names


def _parse_deterministic(question: str, context: Optional[dict[str, Any]]) -> CommunicationIntent:
    """Rule-based fallback: relationships, possessives, pronouns, spelling."""
    q = question.strip()
    ql = q.lower()
    last = (context or {}).get("last_message_draft") if context else None

    action = "email" if ("email" in ql or "emial" in ql or "e-mail" in ql) else ("reminder" if "remind" in ql else "message")

    # --- Recipient resolution ---
    recipient_name: Optional[str] = None
    relationship: Optional[str] = None
    recipient_desc: Optional[str] = None
    pronoun_ref = False

    # Possessive forms: "Charan's classmate", "charan's classmate", "Rahul's classmate", "Ravi's friend"
    import re
    _rel_union = "|".join(sorted(_RELATIONSHIPS, key=len, reverse=True))
    poss = re.search(
        rf"\b([a-zA-Z]+)(?:'s|’s)\s+({_rel_union})(?:\s+(?:that|to|about|regarding)|,|$)",
        q,
        flags=re.IGNORECASE,
    )
    if poss and poss.group(1).lower() not in _NAME_STOPWORDS:
        owner, rel = poss.group(1), poss.group(2).strip()
        relationship = rel if rel.lower() in _RELATIONSHIPS or rel.lower().split()[0] in _RELATIONSHIPS else rel.lower()
        recipient_desc = f"{owner}'s {relationship}"
        try:
            from app.config import get_settings
            from app.core.identity_memory import resolve_recipient_reference

            res = resolve_recipient_reference(get_settings().database_path, q, [])
            if res.status == "resolved" and res.resolved_person is not None:
                recipient_name = res.resolved_person.full_name
                body_resolved = _extract_body_deterministic(q)
                return CommunicationIntent(
                    action=action,
                    recipient_name=recipient_name,
                    relationship=relationship,
                    recipient_description=recipient_desc,
                    message=body_resolved,
                    subject=_make_subject(body_resolved, action),
                    confidence=0.88,
                    requires_recipient_confirmation=False,
                    requires_clarification=False,
                )
            if res.status == "ambiguous" and res.candidates:
                names = ", ".join(p.full_name for p in res.candidates[:3])
                return CommunicationIntent(
                    action=action, recipient_name=None, relationship=relationship,
                    recipient_description=recipient_desc, message=_extract_body_deterministic(q),
                    subject=None, confidence=0.4, requires_recipient_confirmation=True,
                    requires_clarification=True,
                    clarification_question=f"Which {relationship} of {owner} should I contact ({names})?",
                )
        except Exception:
            pass
        # unnamed possessive recipient → needs clarification
        return CommunicationIntent(
            action=action, recipient_name=None, relationship=relationship,
            recipient_description=recipient_desc, message=_extract_body_deterministic(q),
            subject=None, confidence=0.4, requires_recipient_confirmation=True,
            requires_clarification=True,
            clarification_question=f"Who is {owner}'s {relationship}? I need a name before drafting.",
        )

    # "my <relationship> <Name>" or "<relationship> <Name>"
    rel_match = re.search(
        r"\b(?:my\s+)?(" + "|".join(sorted(_RELATIONSHIPS, key=len, reverse=True)) + r")\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b",
        q, flags=re.IGNORECASE,
    )
    if rel_match:
        candidate = rel_match.group(2).strip()
        # IGNORECASE lets the name group match lowercase words like "about";
        # only accept a genuine capitalized name.
        if _looks_like_name(candidate.split()[0]) and candidate.split()[0].lower() not in _NAME_STOPWORDS:
            relationship = rel_match.group(1).lower()
            recipient_name = candidate

    # Pronoun / context reference: "Tell him...", "email her...", "message them..."
    if recipient_name is None:
        pron = re.search(r"\b(?:to\s+|tell\s+|message\s+|email\s+|remind\s+)?(he|him|his|she|her|they|them|it)\b", ql)
        if pron and last and last.get("recipient"):
            recipient_name = last["recipient"]
            pronoun_ref = True
        elif pron:
            return CommunicationIntent(
                action=action, recipient_name=None, message=_extract_body_deterministic(q),
                confidence=0.3, requires_clarification=True,
                clarification_question="Who should I send this to?",
            )

    # "Email Charan that..." / "Emial Ravi Kumar that..." / "Message Ravi that..."
    if recipient_name is None:
        m = re.search(
            r"(?:[Ee]-?m(?:ail|ial)|[Mm]essage|[Mm]sg|[Rr]emind|[Nn]otify|[Tt]ell|[Tt]ext|[Ss]end)\s+(?:to\s+|my\s+|the\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b",
            q,
        )
        if m:
            candidate = m.group(1).strip()
            if _looks_like_name(candidate.split()[0]) and candidate.split()[0].lower() not in _NAME_STOPWORDS:
                recipient_name = candidate

    # "... to <Name>" fallback (only capitalized names, skip stopwords)
    if recipient_name is None:
        m = re.search(r"\bto\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b", q)
        if m:
            candidate = m.group(1).strip()
            first = candidate.split()[0]
            if _looks_like_name(first) and first.lower() not in _NAME_STOPWORDS:
                recipient_name = candidate

    # Relationship-only request with no name ("Remind my supplier about payment")
    if recipient_name is None:
        m = re.search(r"\bmy\s+(" + "|".join(sorted(_RELATIONSHIPS, key=len, reverse=True)) + r")\b", ql)
        if m:
            relationship = m.group(1)
            return CommunicationIntent(
                action=action, recipient_name=None, relationship=relationship,
                message=_extract_body_deterministic(q), confidence=0.4,
                requires_recipient_confirmation=True, requires_clarification=True,
                clarification_question=f"Which {relationship} should I contact? Please give a name.",
            )

    message = _extract_body_deterministic(q)
    subject = _make_subject(message, action)

    single_name = recipient_name is not None and len(recipient_name.split()) == 1
    needs_confirm = single_name and not pronoun_ref

    return CommunicationIntent(
        action=action,
        recipient_name=recipient_name,
        relationship=relationship,
        recipient_description=recipient_desc or recipient_name,
        message=message,
        subject=subject,
        confidence=0.85 if recipient_name else 0.4,
        requires_recipient_confirmation=needs_confirm or pronoun_ref,
        requires_clarification=recipient_name is None,
        clarification_question=None if recipient_name else "Who should I send this to?",
    )


def _extract_body_deterministic(question: str) -> str:
    """Extract message content after 'that' or the recipient phrase; fix spelling."""
    import re
    q = question.strip()
    m = re.search(r"\bthat\b\s*(.+)$", q, flags=re.IGNORECASE | re.DOTALL)
    if m:
        body = m.group(1)
    else:
        # strip leading verb + recipient phrase
        body = re.sub(
            r"^(?:please\s+)?(?:[Ee]mail|[Mm]essage|[Mm]sg|[Rr]emind|[Nn]otify|[Tt]ell|[Tt]ext|[Ss]end)\b.*?\b(?:that|to|about|regarding)\b\s*",
            "", q, flags=re.IGNORECASE,
        )
        if body == q:
            body = re.sub(r"^(?:please\s+)?(?:[Ee]mail|[Mm]essage|[Mm]sg|[Rr]emind|[Nn]otify|[Tt]ell|[Tt]ext|[Ss]end)\s+(?:a\s+|an\s+|the\s+)?(?:payment\s+|follow[- ]?up\s+)?(?:reminder|message|note|email|text)\b", "", q, flags=re.IGNORECASE)
    body = body.strip().strip("\"'").rstrip("?.!")
    # strip trailing recipient clause "... to Ravi"
    body = re.sub(r"\s+to\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2}\s*$", "", body)
    return _fix_spelling(body) or question


def _make_subject(message: str, action: str) -> Optional[str]:
    if action != "email":
        return None
    ml = message.lower()
    if "absent" in ml or "not attend" in ml or "not coming" in ml or "won't" in ml or "will not" in ml:
        return "Unable to Attend"
    if "payment" in ml or "pay" in ml:
        return "Payment Reminder"
    if "delay" in ml or "late" in ml:
        return "Delay Notice"
    words = [w.capitalize() for w in message.split()[:6] if w.lower() not in _NAME_STOPWORDS]
    return " ".join(words)[:60] if words else "Message from ResolveX"


_GEMINI_SCHEMA_PROMPT = """You are a precise NLU parser. Extract structured intent from this message request.
Return JSON with keys: action (email|message|reminder|notify), recipient_name (person name only, or null),
relationship (e.g. classmate|friend|manager|supplier, or null), message (content, grammar-corrected, keep meaning),
subject (short email subject or null), confidence (0-1), requires_clarification (bool), clarification_question (string or null).
Rules: never put relationship words or stopwords (that/this/tomorrow/class) in recipient_name.
Distinguish 'Email Charan that X' (recipient Charan) from \"Email Charan's classmate that X\" (recipient is the unnamed classmate -> requires_clarification=true).
Fix spelling mistakes (comming->coming, colege->college, tommorow->tomorrow). Do not invent names or addresses.
Request: <<<{q}>>>"""


def parse_communication(
    question: str,
    context: Optional[dict[str, Any]] = None,
    use_gemini: bool = True,
) -> CommunicationIntent:
    """Parse a communication request: deterministic DB identity/relationships are authoritative;
    Gemini may assist with spelling/message extraction when identity is open.
    """
    det = _parse_deterministic(question, context)

    # Check deterministic identity & relationship DB resolution authoritatively
    id_res = None
    try:
        from app.config import get_settings
        from app.core.identity_memory import resolve_recipient_reference

        id_res = resolve_recipient_reference(get_settings().database_path, question, [])
    except Exception:
        id_res = None

    if id_res is not None:
        if id_res.status == "resolved" and id_res.resolved_person is not None:
            det.recipient_name = id_res.resolved_person.full_name
            det.requires_clarification = False
            det.requires_recipient_confirmation = False
        elif id_res.status == "ambiguous" and id_res.candidates and det.recipient_description and "'s " in det.recipient_description:
            det.recipient_name = None
            det.requires_clarification = True
            det.requires_recipient_confirmation = True
            names = ", ".join(p.full_name for p in id_res.candidates[:3])
            det.clarification_question = id_res.question or f"Which person do you mean ({names})?"
            return det

    if use_gemini:
        try:
            from app.services.gemini_service import call_gemini_structured
            from app.config import get_settings

            settings = get_settings()
            if getattr(settings, "gemini_api_key", None):
                result, err = call_gemini_structured(
                    _GEMINI_SCHEMA_PROMPT.format(q=question),
                    CommunicationIntent,
                    temperature=0.1,
                )
                if result is not None:
                    # Re-apply deterministic DB recipient resolution so Gemini never overrides
                    # known database relationships or drops lone-name disambiguation.
                    if id_res is not None and id_res.status == "resolved" and id_res.resolved_person is not None:
                        result.recipient_name = id_res.resolved_person.full_name
                        result.requires_clarification = False
                        result.requires_recipient_confirmation = False
                        result.clarification_question = None
                        result.relationship = result.relationship or id_res.used_relationship or det.relationship
                    else:
                        bad = {"there", "this", "that", "class", "friend", "tomorrow", "message", "email"}
                        if result.recipient_name and result.recipient_name.strip().lower() in bad:
                            result.recipient_name = None
                            result.requires_clarification = True
                            result.clarification_question = result.clarification_question or "Who should I send this to?"
                        if result.recipient_name and len(result.recipient_name.split()) == 1:
                            result.requires_recipient_confirmation = True
                    if not result.message:
                        result.message = det.message or _extract_body_deterministic(question)
                    if result.requires_clarification and not result.clarification_question:
                        result.clarification_question = "Who should I send this to?"
                    return result
        except Exception:
            pass
    return det


# ---------------------------------------------------------------------------
# Unified NLU analysis adapter
#
# Exposes deterministic communication interpretation as the shared
# GeminiAnalysisOutput schema so the general ambiguity pipeline, the local
# resolver and the ops query router all consume one structured representation.
# ---------------------------------------------------------------------------

_COMMS_STRONG = re.compile(
    r"\b(e-?mail|emial|message|msg|remind|notify|text|tell|forward)\b", re.IGNORECASE
)
_COMMS_SEND = re.compile(
    r"\b(send|share)\b[^.]*\b(reminder|message|email|e-mail|note|text|invoice|payment)\b",
    re.IGNORECASE,
)
_PRONOUN = re.compile(r"\b(he|him|his|she|her|they|them|it|this|that)\b", re.IGNORECASE)


def looks_like_communication(text: str) -> bool:
    """True when the instruction is person-directed messaging, not a delivery
    or document-send request (those stay with the generic send pipeline)."""
    return bool(_COMMS_STRONG.search(text) or _COMMS_SEND.search(text))


def _followup_reference(question: str) -> bool:
    """Pronoun/anaphoric follow-up that edits or extends an existing draft.

    Requires the reference to be genuinely unresolved: edit verbs with a
    pronoun ('Make it more formal'), or a pronoun recipient with no named
    person anywhere in the request ('Tell him I will share the notes').
    """
    q = question.strip()
    # Draft-edit follow-ups: 'Make it more formal', 'Change it back'. Exclude
    # requests whose object is a business artifact (note, order, report...).
    if (
        re.match(r"^\s*(make|change|update|rewrite|shorten|lengthen)\b", q, re.IGNORECASE)
        and _PRONOUN.search(q)
        and not re.search(
            r"\b(note|record|reminder|order|report|document|file|meeting|"
            r"appointment|alarm|task|schedule|booking|reservation)\b",
            q,
            re.IGNORECASE,
        )
    ):
        return True
    # Pronoun recipient with no named person anywhere: 'Tell him ...',
    # 'Send it to them ...'. Check names AFTER the leading verb so the verb
    # itself is not mistaken for a name.
    if re.match(
        r"^\s*(tell|send|email|e-mail|message|msg|text|forward|remind|notify)\s+"
        r"(?:to\s+)?(he|him|his|she|her|they|them|it|this|that)\b",
        q,
        re.IGNORECASE,
    ):
        rest = re.sub(r"^\s*\w+\s+", "", q, count=1)
        if not _extract_names(rest):
            return True
    # short imperative edits like "Make it shorter" / "More formal please"
    return bool(
        len(q.split()) <= 8
        and re.search(r"\b(formal|polite|shorter|longer|brief)\b", q, re.IGNORECASE)
        and not re.search(r"\b(note|record|order|report|document|file|meeting|alarm|task)\b", q, re.IGNORECASE)
    )


def communication_analysis(
    question: str,
    context: Optional[dict[str, Any]] = None,
) -> Optional[Any]:
    """Return a GeminiAnalysisOutput for communication requests, else None.

    Deterministic only (no extra model call): the LLM interpretation layer is
    reconciled against this safe reading in ambiguity_detector.
    """
    from app.models.ai_schemas import (
        GeminiAnalysisOutput,
        InterpretationOutput,
        ResolvedIntentOutput,
    )

    q = question.strip()
    if not q:
        return None

    # Pronoun/anaphoric follow-ups resolve against the active draft at the
    # execution layer; the interpretation is context-dependent by definition.
    if _followup_reference(q):
        has_draft = bool(context and context.get("last_message_draft"))
        return GeminiAnalysisOutput(
            classification="context_dependent",
            ambiguity_types=["contextual"],
            needs_clarification=not has_draft,
            reasoning="Pronoun or anaphoric reference resolves against the active conversation draft.",
            interpretations=[
                InterpretationOutput(
                    label="Update active draft",
                    description="The request edits or extends the message draft from the current conversation.",
                )
            ],
            missing_required_info=[] if has_draft else ["referent of the pronoun or 'it'"],
            clarification_questions=(
                []
                if has_draft
                else ["What should 'it' refer to? There is no active draft in this conversation."]
            ),
            resolved_intent=(
                ResolvedIntentOutput(
                    action="update_message_draft",
                    parameters={},
                    resolved_instruction=q,
                    direct_answer="Interpreted as an update to the active message draft.",
                )
                if has_draft
                else None
            ),
        )

    if not looks_like_communication(q):
        return None

    intent = _parse_deterministic(q, context)
    recipient = intent.recipient_name or intent.recipient_description or intent.relationship

    # A literal email address is a fully identified recipient.
    if not recipient:
        addr = re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", q)
        if addr:
            recipient = addr.group(0)

    if intent.requires_clarification and recipient and "@" in recipient:
        intent.requires_clarification = False

    if intent.requires_clarification or not recipient:
        question_text = intent.clarification_question or "Who should I send this to?"
        return GeminiAnalysisOutput(
            classification="ambiguous",
            ambiguity_types=["referential", "underspecification"],
            needs_clarification=True,
            reasoning="Communication request lacks a confidently identified recipient.",
            interpretations=[
                InterpretationOutput(
                    label="Unresolved recipient",
                    description=question_text,
                )
            ],
            missing_required_info=["recipient"],
            clarification_questions=[question_text],
            resolved_intent=None,
        )

    # A lone first name with no relationship qualifier still needs confirmation;
    # a relationship ('my classmate Charan') or multi-word name is sufficient.
    single_unqualified = (
        intent.recipient_name is not None
        and len(intent.recipient_name.split()) == 1
        and not intent.relationship
        and intent.recipient_description in (None, intent.recipient_name)
    )
    if single_unqualified:
        return GeminiAnalysisOutput(
            classification="ambiguous",
            ambiguity_types=["referential"],
            needs_clarification=True,
            reasoning="Recipient is a single unqualified name; identity cannot be confirmed.",
            interpretations=[
                InterpretationOutput(
                    label=f"Confirm recipient {intent.recipient_name}",
                    description="A first name alone does not uniquely identify a person.",
                )
            ],
            missing_required_info=["recipient confirmation"],
            clarification_questions=[
                f"There may be more than one {intent.recipient_name}. Can you confirm the full name or relationship?"
            ],
            resolved_intent=None,
        )

    subject = intent.subject or ""
    resolved = (
        f"Draft a {intent.action} to {recipient}"
        + (f" — subject: {subject}" if subject else "")
        + (f'. Message: "{intent.message}"' if intent.message else "")
    )
    return GeminiAnalysisOutput(
        classification="clear",
        ambiguity_types=[],
        needs_clarification=False,
        reasoning="Recipient and message content are identified; draft-only, no message is sent.",
        interpretations=[],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=ResolvedIntentOutput(
            action="draft_message",
            parameters={
                "channel": intent.action,
                "recipient": recipient,
                "relationship": intent.relationship or "",
                "subject": subject,
                "message": intent.message,
            },
            resolved_instruction=resolved,
            direct_answer=(
                f"Draft prepared for {recipient}. It has NOT been sent — "
                "no messaging provider is connected."
            ),
        ),
    )
