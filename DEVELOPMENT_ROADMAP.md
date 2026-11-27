# ResolveX — Development Roadmap & Hackathon Delivery Strategy

## 1. Milestone Breakdown (12 Milestones)

### Milestone 1: Project Setup & FastAPI Foundation (**MVP Essential**)
- **Objective:** Initialize Git, virtual environment, project directory skeleton, and runnable FastAPI `/health` app.
- **Files:** `backend/app/main.py`, `backend/requirements.txt`, `backend/.gitignore`, `backend/README.md`.
- **Dependencies:** None.
- **Tasks:** Standardize `backend/` folder, `git init`, create `.venv`, install `google-genai`, create minimal FastAPI app with lifespan & `/health`.
- **Expected Output:** `uvicorn app.main:app` starts cleanly and `/health` returns `200 OK`.
- **Tests Required:** `test_health_endpoint` via `TestClient`.
- **Completion Criteria:** Server boots locally; `/docs` renders Swagger UI.

### Milestone 2: Configuration, Environment Variables & Database Setup (**MVP Essential**)
- **Objective:** Load `.env` settings securely and initialize SQLite schema.
- **Files:** `backend/app/config.py`, `backend/.env.example`, `backend/app/database/connection.py`, `backend/app/database/operations.py`.
- **Dependencies:** Milestone 1.
- **Tasks:** Implement `Settings` (`pydantic-settings`), write `init_db()` with all 6 tables & indexes, enable `PRAGMA foreign_keys = ON` and `WAL` mode.
- **Expected Output:** `resolvex.db` created automatically on startup with verified tables.
- **Tests Required:** DB initialization and CRUD smoke tests using a temporary SQLite DB (`tmp_path`).
- **Completion Criteria:** All tables and foreign keys verified in tests.

### Milestone 3: Pydantic Schemas & API Contracts (**MVP Essential**)
- **Objective:** Define all request, response, error, and internal AI Pydantic models.
- **Files:** `backend/app/models/schemas.py`, `backend/app/core/exceptions.py`, `backend/app/api/routes.py` (stubs).
- **Dependencies:** Milestone 1.
- **Tasks:** Implement schemas matching `API_CONTRACT.md` (`AnalyzeRequest`, `AnalyzeResponse`, `ClarifyRequest`, `ResolveRequest`, `ErrorResponse`, `GeminiAnalysisOutput`).
- **Expected Output:** OpenAPI `/docs` reflects exact finalized API contract.
- **Tests Required:** Schema validation tests (empty strings, >2000 chars rejected with `422`).
- **Completion Criteria:** Frontend developer can review `/docs` and start integration against mock/stub responses.

### Milestone 4: Gemini Integration Service (**MVP Essential**)
- **Objective:** Connect to Gemini API using `google-genai` with structured JSON output and retry/error handling.
- **Files:** `backend/app/services/gemini_service.py`, `backend/app/services/prompts.py`.
- **Dependencies:** Milestones 2, 3.
- **Tasks:** Initialize `genai.Client`, configure `GenerateContentConfig(response_mime_type="application/json", response_schema=GeminiAnalysisOutput)`, add `tenacity` retries and timeout handling.
- **Expected Output:** Service returns validated `GeminiAnalysisOutput` objects.
- **Tests Required:** Mocked Gemini unit tests (valid JSON, malformed response retry, timeout/API error -> `AIServiceError`).
- **Completion Criteria:** Deterministic error handling verified without live API calls, plus 1 live smoke check with `GEMINI_API_KEY`.

### Milestone 5: Ambiguity Detection Engine (**MVP Essential**)
- **Objective:** Classify instructions (`clear`, `ambiguous`, `incomplete`, `context_dependent`) and detect MVP ambiguity types.
- **Files:** `backend/app/core/ambiguity_detector.py`.
- **Dependencies:** Milestones 3, 4.
- **Tasks:** Combine Gemini classification with deterministic pre/post-checks (empty input guard, clear instruction fast-path).
- **Expected Output:** Clear instructions bypass clarification; ambiguous/incomplete inputs are flagged accurately.
- **Tests Required:** Unit tests for all 4 classifications and the 3 core examples.
- **Completion Criteria:** Clear instructions never trigger unnecessary questions in unit tests.

### Milestone 6: Interpretation Engine (**MVP Essential**)
- **Objective:** Extract structured candidate interpretations and required missing slots.
- **Files:** `backend/app/core/interpretation_engine.py`.
- **Dependencies:** Milestone 5.
- **Tasks:** Normalize interpretation labels/descriptions and filter out optional-only gaps.
- **Expected Output:** Concise list of interpretations and `missing_required_info`.
- **Tests Required:** Unit tests verifying required vs. optional filtering.
- **Completion Criteria:** Interpretations are clear and non-redundant.

### Milestone 7: Clarification Engine (**MVP Essential**)
- **Objective:** Generate minimal, non-repetitive clarification questions with turn limits.
- **Files:** `backend/app/core/clarification_engine.py`.
- **Dependencies:** Milestones 5, 6.
- **Tasks:** Deduplicate questions against prior `clarification_questions`, cap questions per turn (max 3), enforce `MAX_CLARIFICATION_TURNS`.
- **Expected Output:** Targeted questions; zero repeated questions across turns.
- **Tests Required:** Unit tests for duplicate-question filtering and max-turn termination.
- **Completion Criteria:** Repeated question edge case passes.

### Milestone 8: Context & Conversation Management (**MVP Essential**)
- **Objective:** Orchestrate multi-turn state and context window construction.
- **Files:** `backend/app/core/context_analyzer.py`, `backend/app/services/conversation_service.py`.
- **Dependencies:** Milestones 2, 5, 6, 7.
- **Tasks:** Build conversation history formatter, enforce state machine (`NEEDS_CLARIFICATION` -> `RESOLVED`), wire `POST /api/analyze` and `POST /api/clarify`.
- **Expected Output:** Multi-turn clarification flow works end-to-end.
- **Tests Required:** Integration tests for 2-turn and 3-turn clarification flows.
- **Completion Criteria:** Pronouns and partial answers from turn 2+ resolve turn 1's instruction.

### Milestone 9: Intent Resolution & Structured Output (**MVP Essential**)
- **Objective:** Produce and validate final structured JSON intent.
- **Files:** `backend/app/core/intent_resolver.py`, `backend/app/api/routes.py` (`POST /api/resolve`).
- **Dependencies:** Milestone 8.
- **Tasks:** Merge context into `ResolvedIntentPayload`, validate non-empty `action`/`resolved_instruction` and absence of placeholder values (`TBD`, `UNKNOWN`).
- **Expected Output:** Clean structured JSON intent returned by `/api/analyze` (when clear), `/api/clarify` (when resolved), and `/api/resolve`.
- **Tests Required:** Validation tests rejecting incomplete/placeholder intents.
- **Completion Criteria:** All 3 core examples produce expected structured output.

### Milestone 10: Database Persistence & History Endpoints (**MVP Essential**)
- **Objective:** Persist all turns, questions, interpretations, and intents; expose `GET /api/conversations`.
- **Files:** `backend/app/database/operations.py`, `backend/app/api/routes.py`.
- **Dependencies:** Milestones 2, 8, 9.
- **Tasks:** Wire full DB writes on every turn and implement `GET /api/conversations` (list & `?conversation_id=` detail mode).
- **Expected Output:** Restarting server preserves all conversations and resolved intents.
- **Tests Required:** API persistence tests across simulated restarts.
- **Completion Criteria:** Full conversation history retrievable via API.

### Milestone 11: Testing & Evaluation (**MVP Essential for Demo Credibility**)
- **Objective:** Run full test suite, build labelled evaluation dataset, and run benchmark + baseline comparison.
- **Files:** `backend/tests/eval_dataset.json`, `backend/tests/run_evaluation.py`, `backend/app/api/routes.py` (`GET /api/evaluation`).
- **Dependencies:** Milestones 1–10.
- **Tasks:** Curate ~48 labelled test cases, run evaluation script, store real metrics in `evaluation_records`, expose via `GET /api/evaluation`.
- **Expected Output:** Reproducible precision, recall, F1, resolution accuracy, and false clarification rate.
- **Tests Required:** Full `pytest` suite + edge-case suite.
- **Completion Criteria:** All automated tests pass; real evaluation metrics recorded.

### Milestone 12: Frontend Integration Readiness (**MVP Essential**)
- **Objective:** Finalize CORS, Swagger docs, README curl examples, and verify live integration with frontend.
- **Files:** `backend/app/main.py`, `backend/README.md`.
- **Dependencies:** Milestones 1–11.
- **Tasks:** Verify CORS headers, test all endpoints from Swagger UI and frontend client, freeze `requirements.txt`.
- **Expected Output:** Frontend connects seamlessly without backend changes.
- **Tests Required:** CORS preflight test (`OPTIONS`), end-to-end smoke test.
- **Completion Criteria:** Live MVP demo flow passes end-to-end.

---

## 2. 24-Hour Hackathon Delivery Strategy

- **Critical Features (Must-Have):**
  - `/api/analyze`, `/api/clarify`, `/api/resolve`, `/api/conversations`, `/health`.
  - Gemini `google-genai` structured output + deterministic validation.
  - Multi-turn SQLite persistence + anti-repetition clarification.
  - Clear instruction fast-path (zero unnecessary questions).
- **Postponed Features (Post-MVP):**
  - Deep syntactic/parse-tree structural ambiguity.
  - User authentication / multi-tenant isolation.
  - Per-IP rate limiting middleware.
  - Streaming SSE responses.
- **Technical Risks & Bottlenecks:**
  1. `google-genai` compatibility on Python 3.14.4 (mitigate by testing install immediately in Milestone 1; fallback to Python 3.12 venv if needed).
  2. Gemini rate limits / latency during live demo (mitigate with configurable `GEMINI_MODEL` such as `gemini-3.8-flash`, `tenacity` retries, and pre-recorded/cached evaluation metrics).
  3. Over-clarification on clear prompts (mitigate with explicit few-shot examples in `prompts.py` and evaluation tracking of False Clarification Rate).
- **Minimum Viable Demonstration Flow:**
  1. Submit *"Send the report to Rahul."* -> Backend detects referential ambiguity & missing report name -> asks targeted clarification -> user replies -> backend resolves into structured JSON intent.
  2. Submit *"Book a table for tomorrow evening."* -> Backend detects underspecification -> asks restaurant & party size -> user replies -> resolves.
  3. Submit *"Convert 100 kilometres to metres."* -> Backend recognizes clear instruction -> returns direct answer + structured intent with **zero** clarification questions.
