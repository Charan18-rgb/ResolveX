"""Structured natural-language understanding for communication intents.

Uses Gemini structured interpretation when configured, with a deterministic
fallback that handles relationships, possessives, pronouns and spelling.
"""

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

    action = "email" if "email" in ql or "e-mail" in ql else ("reminder" if "remind" in ql else "message")

    # --- Recipient resolution ---
    recipient_name: Optional[str] = None
    relationship: Optional[str] = None
    recipient_desc: Optional[str] = None
    pronoun_ref = False

    # Possessive forms: "Charan's classmate" → recipient is the classmate, NOT Charan
    import re
    poss = re.search(r"([A-Z][a-zA-Z]+)(?:'s|’s)\s+([a-zA-Z ]+?)(?:\s+(?:that|to|about|regarding)|,|$)", q)
    if poss:
        owner, rel = poss.group(1), poss.group(2).strip()
        relationship = rel if rel.lower() in _RELATIONSHIPS or rel.lower().split()[0] in _RELATIONSHIPS else rel.lower()
        recipient_desc = f"{owner}'s {relationship}"
        # unnamed possessive recipient → needs clarification
        return CommunicationIntent(
            action=action, recipient_name=None, relationship=relationship,
            recipient_description=recipient_desc, message=_extract_body_deterministic(q),
            subject=None, confidence=0.4, requires_recipient_confirmation=True,
            requires_clarification=True,
            clarification_question=f"Who is {owner}'s {relationship}? I need a name or identifier before drafting.",
        )

    # "my <relationship> <Name>" or "<relationship> <Name>"
    rel_match = re.search(
        r"\b(?:my\s+)?(" + "|".join(sorted(_RELATIONSHIPS, key=len, reverse=True)) + r")\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b",
        q, flags=re.IGNORECASE,
    )
    if rel_match:
        relationship = rel_match.group(1).lower()
        recipient_name = rel_match.group(2).strip()

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

    # "Email Charan that..." / "Message Ravi that..." / "Tell Ravi that..."
    if recipient_name is None:
        m = re.search(
            r"(?:[Ee]mail|[Mm]essage|[Mm]sg|[Rr]emind|[Nn]otify|[Tt]ell|[Tt]ext|[Ss]end)\s+(?:to\s+|my\s+|the\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b",
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
    """Parse a communication request: Gemini structured first, deterministic fallback."""
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
                    # deterministic safety net: never trust 'there'/stopword recipients
                    bad = {"there", "this", "that", "class", "friend", "tomorrow", "message", "email"}
                    if result.recipient_name and result.recipient_name.strip().lower() in bad:
                        result.recipient_name = None
                        result.requires_clarification = True
                        result.clarification_question = result.clarification_question or "Who should I send this to?"
                    if not result.message:
                        result.message = _extract_body_deterministic(question)
                    if result.requires_clarification and not result.clarification_question:
                        result.clarification_question = "Who should I send this to?"
                    # deterministic rule: a lone first name always needs confirmation
                    if result.recipient_name and len(result.recipient_name.split()) == 1:
                        result.requires_recipient_confirmation = True
                    return result
        except Exception:
            pass
    return _parse_deterministic(question, context)
