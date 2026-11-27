# FINAL NLU EVALUATION REPORT — ResolveX PS6

Date: 2026-11-28 · Commits: `2cd00be` → audit fixes · Branch: `main`

## 1. Requirement mapping (PS6)

| Requirement | Implementation | Status |
|---|---|---|
| Intent recognition | `ambiguity_detector` → Gemini structured `GeminiAnalysisOutput` (classification, interpretations, needs_clarification) + `task_router`/`intent_resolver` | Implemented |
| Ambiguity detection | `detect_ambiguity_with_status` → classification + ambiguity categories; deterministic `local_analyzer` fallback | Implemented |
| Multiple interpretations | `interpretations[]` with confidence/supporting/contradicting signals; frontend What-If simulator | Implemented |
| Clarification questions | `clarification_engine` + `/api/clarify` multi-turn; `conversation_service` turn tracking | Implemented |
| Pronoun/reference resolution | `context_analyzer` + conversation context memory; comms follow-ups resolve him/her/it via `last_message_draft` | Implemented (comms-scoped + pipeline context memory) |
| Entity/relationship extraction | `communication_parser.py` — recipient, relationship, possessives, spelling fixes; Gemini structured NLU | Implemented |
| Confidence measurement | `confidence_engine` calibrated scores + abstention; surfaced in UI | Implemented |
| Structured output | Pydantic schemas end-to-end (`BackendAnalyzeResponse`, `CommunicationIntent`) | Implemented |
| Reverse questioning | Missing-parameter → targeted questions; possessive unnamed recipient → clarification | Implemented |
| Context retention | `conversations`/`messages`/`clarifications` tables; turn_count; frontend `conversation_id` tracking | Implemented |

## 2. Architecture

```
user text
  ├─ ops/query comms branch? → communication_parser
  │     ├─ Gemini structured (CommunicationIntent)  [primary]
  │     └─ deterministic fallback (relationships, possessives, pronouns, spelling)
  │     → ambiguous? → "help" → main analyze pipeline (interpretations + clarify)
  └─ else → /api/analyze → ambiguity_detector (Gemini-first, local fallback)
        → interpretations → clarify → resolve (multi-turn, context memory)
```

LLM use is **hybrid, not 100%**: Gemini does sentence-level interpretation;
deterministic code validates recipients (rejects "there"/stopwords), computes
inventory math, enforces roles, and drafts messages. This matches the rules —
the LLM interprets, it does not execute privileged actions.

## 3. Model & config

- `GEMINI_API_KEY` in `backend/.env` only; model `gemini-3.8-flash` with configured fallbacks; temp 0.1 for structured calls; `call_gemini_structured` handles retries/quota cascade.

## 4. Before → after (verified live)

| Input | Before | After |
|---|---|---|
| `email my classmate Charan K that i am not attending tomorrow's class` | recipient `there` | recipient **Charan K**, relationship classmate, subject generated, DRAFT ONLY |
| `Email Charan's classmate that I will be absent tomorrow.` | recipient `there`/Charan | clarification: "Who specifically is Charan's classmate?" |
| `Message Ravi that tomorrow is the last date for payment for stock.` | inventory summary card | message draft + recipient-confirmation prompt |
| `Tell him I will share the notes later.` (after draft) | unrelated route | same draft updated, "him"→Charan Kumar |
| `Make that message more polite.` | n/a | tone=polite rewrite of same draft |

## 5. Benchmark

- Dataset: `backend/tests/evaluation/ps6_dataset.json` — **72 cases** (was 60; +12 NLU cases: communication, relationships, possessives, pronouns, spelling, inventory/warehouse/supplier phrasing).
- Categories covered: clear, ambiguous, context_dependent, adversarial, multi-intent, spelling, pronoun follow-ups.
- Latest full measured run (pre-NLU-merge, 60-case live eval): P=0.9388 R=0.9787 F1=0.9583, resolution_accuracy=0.75, FCR=0.05 — see `EVALUATION_REPORT.md`. **The 12 new cases have not been live-scored yet** — run `GET /api/evaluation/ps6?run_now=true` as operator for updated numbers.

## 6. Test results

- Backend pytest: **72/72** (incl. 12 comms/NLU regression tests in `test_ops_query.py`)
- Frontend Vitest: **26/26** · `tsc --noEmit`: 0 errors · `npm run build`: pass
- Multi-turn clarify→resolve verified live (RESOLVED, turn 2)

## 7. Honest limitations

- Comms draft quality depends on Gemini; deterministic fallback is good but simpler.
- No contacts database — recipient identity can't be verified against records; system asks for confirmation instead (safe).
- New dataset cases are regression-tested via unit tests but not yet included in a fresh live-model benchmark score.
- Pronoun resolution outside comms drafts relies on pipeline context memory, which is conversation-scoped and resets per conversation (correct behavior).
- `X-User-Role` remains demo-level auth (documented).

## 8. Remaining risks

- Gemini ambiguity judgments can be conservative (e.g. "my class Charan" → clarification instead of draft) — acceptable safe behavior, may cost a turn.
- Very long/compound sentences may exceed structured-output reliability; fallback chain mitigates.
