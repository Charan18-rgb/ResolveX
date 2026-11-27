# ResolveX — Complete Backend Architecture & Plan

## 1. Project Understanding & Core Objective

**ResolveX** is an AI-powered Natural Language Ambiguity Identification and Resolution System. Given a user's natural-language instruction, the backend must:
1. Distinguish between **clear**, **ambiguous**, **incomplete**, and **context-dependent** instructions.
2. **Avoid unnecessary clarification:** Clear instructions (e.g., *"Convert 100 kilometres to metres."*) must be resolved directly without asking follow-up questions.
3. **Identify possible interpretations** and **missing required information** when the input is ambiguous or underspecified (e.g., *"Send the report to Rahul."* -> multiple Rahuls; *"Book a table for tomorrow evening."* -> missing restaurant and party size).
4. **Ask targeted clarification questions** across one or more turns while preserving conversation context.
5. **Produce a validated, structured JSON intent** once sufficient information is available.

---

## 2. Technology Stack & Verified Decisions

| Layer | Choice | Rationale |
| :--- | :--- | :--- |
| **Language** | Python 3.14+ (or 3.12 fallback) | Installed locally (`3.14.4`); rapid hackathon iteration. |
| **Web Framework** | FastAPI (`0.136.3`) | Built-in Pydantic validation, async support, automatic Swagger/OpenAPI (`/docs`). |
| **Validation** | Pydantic v2 (`2.13.4`) | Enforces strict API contracts and validates Gemini JSON outputs. |
| **AI SDK** | `google-genai` (unified SDK) | Official current Gemini SDK (replaces deprecated `google-generativeai`). Supports `response_schema` with Pydantic models. |
| **Model Config** | Configurable `GEMINI_MODEL` (default `gemini-3.8-flash`) | Loaded from `.env` via `pydantic-settings` (never hardcoded). `gemini-3.8-flash` is the current stable production flash model (with `gemini-4-hydrogen` or `gemini-3.6-flash` configurable via env). |
| **Database** | SQLite (`sqlite3` 3.50.4) | Zero-infrastructure, file-based, sufficient for hackathon persistence. |
| **Testing** | `pytest` + `httpx` | Standard FastAPI `TestClient` and unit/integration testing. |
| **Config** | `pydantic-settings` + `.env` | Securely loads `GEMINI_API_KEY` and runtime settings without hardcoding. |
| **Containerization** | None (No Docker) | Explicitly excluded per project constraints. |

---

## 3. Complete Backend Architecture

The backend follows a **modular monolith** pattern: thin HTTP routes, deterministic orchestration/validation in `core/`, external I/O isolated in `services/` and `database/`.

```text
HTTP Request
   │
   ▼
[ API Layer (routes.py) ]  ── Pydantic Request Validation & Error Mapping
   │
   ▼
[ Conversation Service (conversation_service.py) ]  ── Orchestrates Turn Lifecycle & State
   ├──► [ Database Layer (operations.py) ]          ── Loads/Saves History & State
   ├──► [ Context Analyzer (context_analyzer.py) ]  ── Builds Turn Context & Prior Answers
   ├──► [ Ambiguity Detector (ambiguity_detector.py) ]  ── Classifies Input & Ambiguity Types
   ├──► [ Interpretation Engine (interpretation_engine.py) ] ── Candidate Meanings & Missing Slots
   ├──► [ Clarification Engine (clarification_engine.py) ]   ── Deduplicated Targeted Questions
   └──► [ Intent Resolver (intent_resolver.py) ]    ── Merges Context -> Validated Final Intent
          │
          ▼
   [ Gemini Service (gemini_service.py) ]  ── google-genai Client, Prompts, Retries, Schema Parse
```

### Module Responsibilities

#### A. API Layer (`app/api/routes.py`)
- Exposes REST endpoints (`/health`, `/api/analyze`, `/api/clarify`, `/api/resolve`, `/api/conversations`, `/api/evaluation`).
- Validates incoming JSON via Pydantic schemas.
- Delegates business logic to `ConversationService`; never contains prompt text or SQL queries.
- Maps domain exceptions to consistent HTTP status codes and JSON error payloads.

#### B. Ambiguity Detection Engine (`app/core/ambiguity_detector.py`)
- Classifies the instruction into one of four states: `clear`, `ambiguous`, `incomplete`, or `context_dependent`.
- Evaluates ambiguity categories:
  - **MVP Scope (Include):**
    1. **Referential Ambiguity:** Unclear entity/target (e.g., *"Send the report to Rahul."* — which Rahul?).
    2. **Underspecification (Incomplete):** Missing required parameters for an action (e.g., *"Book a table for tomorrow evening."* — missing restaurant, party size).
    3. **Contextual Ambiguity:** Depends on prior conversation turns or implicit situational context (e.g., *"Send it to him instead."*).
    4. **Lexical / Semantic Ambiguity (Lightweight):** Words or phrases with multiple actionable meanings (e.g., *"Set a reminder for 8."* — 8 AM or 8 PM?).
  - **Post-MVP (Postpone):**
    - **Deep Structural (Syntactic) Ambiguity:** Complex parse-tree attachments (e.g., *"I saw the man with the telescope"*) unless they directly alter actionable parameters, as they rarely occur in task-oriented instructions and add prompt complexity.
- **Deterministic Gate:** Runs rule-based sanity checks (e.g., empty/whitespace input, obvious unit conversions or direct factual queries flagged clear, max clarification turns reached) alongside Gemini's structured analysis.

#### C. Context Analysis Engine (`app/core/context_analyzer.py`)
- Retrieves prior messages, previously asked questions, and user answers for a `conversation_id`.
- Formats a compact, chronological context window for Gemini so pronouns (*"it"*, *"that"*, *"him"*) and partial answers (*"4 people at Olive Garden"*) are bound to the original instruction.
- Tracks which ambiguities/missing slots have already been resolved.

#### D. Interpretation Engine (`app/core/interpretation_engine.py`)
- Generates 2–4 plausible interpretations when an input is ambiguous (each with a short label and plain-English explanation).
- Identifies **required missing information** vs. **optional nice-to-have details** (never blocks resolution on optional fields).

#### E. Clarification Engine (`app/core/clarification_engine.py`)
- Selects the minimal set of clarification questions (ideally 1–2 concise questions per turn, max 3) needed to resolve the ambiguity.
- **Anti-Repetition Guard:** Compares newly proposed questions against `clarification_questions` already asked in the conversation (normalized string/semantic check) to prevent looping.
- Enforces a configurable `MAX_CLARIFICATION_TURNS` (default: `3`) so conversations always terminate gracefully.

#### F. Intent Resolution Engine (`app/core/intent_resolver.py`)
- Combines the original instruction + all clarification Q&A turns into a structured final intent:
  - `action` (e.g., `send_email`, `book_table`, `unit_conversion`)
  - `parameters` (key-value dictionary of resolved entities/values)
  - `resolved_instruction` (clean, unambiguous natural-language summary)
  - `direct_answer` (optional, for clear informational/conversion tasks like *"Convert 100 kilometres to metres."*)
- **Deterministic Validation:** Verifies that `action` and `resolved_instruction` are non-empty and that no placeholder values (e.g., `"UNKNOWN"`, `"TBD"`) remain in required parameters.

#### G. Gemini Integration Service (`app/services/gemini_service.py`)
- Wraps `google.genai.Client(api_key=settings.gemini_api_key)`.
- Uses `types.GenerateContentConfig(response_mime_type="application/json", response_schema=..., temperature=0.2)` to enforce structured JSON matching Pydantic models.
- Implements request timeouts, exponential backoff retries (via `tenacity`) for transient 429/503 errors, and strict Pydantic validation of `response.parsed`.

#### H. Conversation Management (`app/services/conversation_service.py`)
- Generates UUIDv4 `conversation_id`s.
- Manages conversation state machine: `ANALYZING` -> `NEEDS_CLARIFICATION` -> `RESOLVED` (or `FAILED`).
- Coordinates the core engines and persists every turn atomically via the Database Layer.

#### I. Database Layer (`app/database/connection.py`, `app/database/operations.py`)
- Manages SQLite connection (`resolvex.db`), initializes tables on startup, enables `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`.
- Provides clean, parameterized CRUD operations without heavy ORM boilerplate.

---

## 4. Project Structure Evaluation & Improvements

The proposed structure is solid and appropriately sized for a 24-hour hackathon. Recommended refinements:
1. **Standardize Directory Name:** The workspace currently has `D:\RESURRECT HACKATHON\BACKEND\`. Rename to lowercase `backend/` (or keep `BACKEND/` consistently) before `git init`.
2. **Add `app/services/prompts.py`:** Keep prompt templates out of `gemini_service.py` so prompt iteration is fast and readable.
3. **Add `app/core/exceptions.py`:** Define clean domain exceptions (`ConversationNotFoundError`, `AIServiceError`, `InvalidStateError`) mapped to HTTP status codes in `main.py`.
4. **Keep `core/` Pure:** Modules in `core/` should accept/return Pydantic models and not import FastAPI or SQLite directly, making unit testing trivial.

```text
ResolveX/
└── backend/
    ├── app/
    │   ├── main.py                  # FastAPI app, CORS, exception handlers, lifespan
    │   ├── config.py                # Pydantic BaseSettings (.env loading)
    │   ├── api/
    │   │   └── routes.py            # REST endpoints
    │   ├── core/
    │   │   ├── exceptions.py        # Domain exceptions
    │   │   ├── ambiguity_detector.py
    │   │   ├── context_analyzer.py
    │   │   ├── interpretation_engine.py
    │   │   ├── clarification_engine.py
    │   │   └── intent_resolver.py
    │   ├── services/
    │   │   ├── gemini_service.py    # google-genai wrapper & retry logic
    │   │   ├── prompts.py           # Versioned prompt templates
    │   │   └── conversation_service.py # Turn orchestration
    │   ├── models/
    │   │   └── schemas.py           # API & AI Pydantic schemas
    │   └── database/
    │       ├── connection.py        # SQLite connection & schema init
    │       └── operations.py        # Parameterized SQL queries
    ├── tests/
    │   ├── test_api.py
    │   ├── test_core.py
    │   ├── test_gemini_service.py
    │   └── eval_dataset.json
    ├── .env.example
    ├── .gitignore
    ├── requirements.txt
    └── README.md
```

---

## 5. AI & Prompt Engineering Plan

### Structured AI Output Schema (Pydantic)
Gemini will be called with `response_schema=GeminiAnalysisOutput`:
- `classification`: `Literal["clear", "ambiguous", "incomplete", "context_dependent"]`
- `ambiguity_types`: `list[Literal["referential", "underspecification", "contextual", "lexical", "semantic"]]`
- `needs_clarification`: `bool`
- `reasoning`: `str` (brief internal explanation)
- `interpretations`: `list[InterpretationItem]` (`label`, `description`)
- `missing_required_info`: `list[str]`
- `clarification_questions`: `list[str]`
- `resolved_intent`: `Optional[ResolvedIntentPayload]` (`action`, `parameters`, `resolved_instruction`, `direct_answer`)

### Strict Guardrails
1. **No Calibrated Probability Claims:** Do not ask Gemini for or expose numeric "confidence percentages" as calibrated probabilities; use categorical status (`clear`, `ambiguous`, `incomplete`, `context_dependent`).
2. **No Invented Information:** System prompt explicitly instructs Gemini never to guess or fabricate missing user parameters (e.g., never invent a restaurant name or recipient email).
3. **Required vs. Optional Distinction:** Prompt instructs Gemini to ask *only* for information strictly required to execute the instruction, ignoring optional preferences unless ambiguous.
4. **Clear Instruction Fast-Path:** If `needs_clarification` is `false` and `resolved_intent` is populated, return the resolved intent immediately.
5. **Failure & Malformed Response Handling:**
   - If `response.parsed` is `None` or fails Pydantic validation: retry once with a stricter formatting reminder; if it still fails, raise `AIServiceError` (HTTP `502` / `503`) with a safe user-facing message.
   - Rate limits / timeouts: `tenacity` retries up to 2 times with short backoff (`1s`, `2s`), bounded by an overall request timeout (e.g., `15s`).

---

## 6. Security & Reliability Checklist

| Control | Category | Priority | Implementation Plan |
| :--- | :--- | :--- | :--- |
| **API Key Protection** | Security | **MVP Essential** | Load `GEMINI_API_KEY` from `.env` via `pydantic-settings`; add `.env` to `.gitignore`. Never log or return keys. |
| **Input Validation & Size Limits** | Security | **MVP Essential** | Enforce `min_length=1`, `max_length=2000` on user text; strip control characters; reject oversized bodies. |
| **Sanitized Error Handling** | Reliability | **MVP Essential** | Global FastAPI exception handler returns structured error JSON without stack traces or internal paths. |
| **SQLite Parameterized Queries** | Security | **MVP Essential** | Use `?` placeholders in all `sqlite3` queries; never interpolate user input into SQL. |
| **CORS Configuration** | Integration | **MVP Essential** | Configure `CORSMiddleware` from `ALLOWED_ORIGINS` env var (default `http://localhost:3000,http://localhost:5173`). |
| **Prompt Injection Mitigation** | Security | **MVP Essential** | Delimit user input in XML-style tags (`<user_input>...</user_input>`) and instruct Gemini to treat it strictly as data, never as system instructions. |
| **Safe Logging** | Reliability | **MVP Essential** | Log `conversation_id`, latency, and status codes; redact API keys and avoid logging raw sensitive payloads in production. |
| **Rate Limiting** | Abuse Control | **Post-MVP** | Add per-IP rate limiting (e.g., `slowapi`) if deployed publicly; not needed for local hackathon demo. |
| **User Auth & Tenant Isolation** | Security | **Post-MVP** | Hackathon MVP uses unauthenticated `conversation_id` (UUIDv4); add JWT/user scoping post-hackathon. |
