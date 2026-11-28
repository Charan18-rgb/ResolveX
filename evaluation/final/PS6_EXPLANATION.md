# PS6 — Natural Language Understanding

## What PS6 is

PS6 is the natural-language-understanding problem: given an instruction in
plain English, decide what the user actually wants — including when the
instruction is ambiguous, incomplete, or depends on earlier conversation
context — and ask for clarification only when genuinely necessary.

## Pipeline stages

| Stage | Implementation | File |
|---|---|---|
| Understand | Gemini structured analysis + deterministic reconciliation | `app/core/ambiguity_detector.py`, `app/services/gemini_service.py`, `app/core/local_analyzer.py` |
| Detect ambiguity | Classification + typed ambiguity tags | `ambiguity_detector.py`, `prompts.py` taxonomy |
| Generate interpretations | Multiple labelled interpretations | `schemas.py` (`interpretations[]`) |
| Ask clarification | Targeted question generation | `app/core/clarification_engine.py` |
| Understand response | `continue_conversation` merges answer into context | `app/services/conversation_service.py` |
| Resolve intent | `intent_resolver.py` + `task_router.py` | `app/core/` |
| Produce output | `resolved_intent` + optional `direct_answer` | `models/schemas.py` |
| Confidence | Calibration + abstention on low confidence | `app/core/confidence_engine.py` |

Context memory (`context_analyzer.py`) carries prior turns, entities and
reference resolutions so pronouns ("him", "it", "that date") resolve against
the conversation, not in isolation.

## Benchmark results (verified)

Dataset: `backend/tests/evaluation/ps6_dataset.json` — 72 labelled cases
(clear / ambiguous / incomplete / context-dependent, plus adversarial).
Live run against `gemini-3.8-flash` (`audit/eval_runs/eval_live4.json`):

- **Precision = Recall = F1 = 0.9412** (needs-clarification detection)
- **Classification accuracy = 0.8056** (72-case label match)
- **False clarification rate = 0.0417** (3/72)
- **Naive keyword baseline F1 = 0.4348** — ResolveX is ~2.2× better
- Fallback: deterministic path used where Gemini was unavailable/quota-limited;
  every result records `provenance` so fallback cases are counted honestly
  (`fallback_cases_count`, `ai_fallback_mixed` provenance flag).

No official PS6/LightLab document ships with the repo; the dataset is our own
labelled set. Metrics were recomputed from raw `results_detail`, not trusted
from summaries.

## Worked examples

### 1. Missing recipient
- **Input:** `Email my classmate about the deadline.`
- **Ambiguity:** which classmate? what about the deadline?
- **Interpretation:** communication intent, recipient = unresolved possessive.
- **Clarification:** "Which classmate are you referring to?" then "What
  specific information or message would you like to send regarding the
  deadline?"
- **Resolution:** after "Charan" + "Tell him the deadline is Friday" →
  `RESOLVED`, `execute_instruction`.

### 2. Pronoun follow-up
- **Input (turn 2):** `Tell him the meeting is postponed.`
- **Context needed:** "him" → the recipient established earlier.
- **Resolution:** pronoun resolved via session memory; draft body updated.

### 3. Date edit
- **Input:** `Change tomorrow to Monday.`
- **Ambiguity:** "tomorrow" is relative; the edit target is the active draft.
- **Resolution:** deterministic content replacement in the draft body —
  `raw_body` regex substitution, draft stays `DRAFT_ONLY`.

### 4. Similar names / relationship
- **Input:** `Email Charan's classmate that the notes are ready.`
- **Ambiguity:** two people in the relationship chain; recipient not a literal
  address.
- **Clarification:** asks to confirm the recipient; `recipient_confirmed`
  stays false until resolved.

### 5. Clear request — no unnecessary question
- **Input:** `Send the report to Rahul.` (with prior draft context)
- **Result:** resolved directly; FCR of 0.0417 shows clear requests rarely
  trigger spurious questions.

### 6. Unsupported request
- **Input:** `Book a flight to Paris` / `Convert 100 km to miles`
- **Result:** classified out-of-scope; abstains or clarifies rather than
  pretending to act — never fabricates an action.

## Safety properties

- Clarification is capped (`MAX_CLARIFICATION_TURNS=3`).
- Low-confidence analyses abstain (`confidence_engine`) instead of guessing.
- Deterministic fallback is labelled via `provenance`.
- Consequential actions route through risk assessment and role gates — the
  assistant never auto-executes purchases, sends, or deletes.
