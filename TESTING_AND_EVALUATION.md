# ResolveX — Testing & Evaluation Plan

## 1. Testing Strategy

All automated tests run via `pytest` without requiring live Gemini API calls (using dependency injection / `unittest.mock` for `GeminiService`), plus an optional live integration/evaluation script when `GEMINI_API_KEY` is present.

### A. Unit Testing (`tests/test_core.py`, `tests/test_gemini_service.py`)
- **`AmbiguityDetector`:** Verify classification of clear, ambiguous, incomplete, and context-dependent inputs.
- **`ContextAnalyzer`:** Verify chronological formatting of multi-turn history.
- **`ClarificationEngine`:** Verify duplicate-question filtering and `MAX_CLARIFICATION_TURNS` enforcement.
- **`IntentResolver`:** Verify rejection of placeholder parameters (`"TBD"`, `"UNKNOWN"`) and valid intent construction.
- **`GeminiService`:** Verify Pydantic `response_schema` parsing, retry on transient error, and `AIServiceError` on persistent malformed output.

### B. Integration Testing (`tests/test_integration.py`)
- Test end-to-end interactions across `routes` -> `ConversationService` -> `core` engines -> `SQLite` (using temporary `tmp_path` database) with mocked `GeminiService`.
- Verify multi-turn state transitions (`ANALYZING` -> `NEEDS_CLARIFICATION` -> `RESOLVED`).

### C. API Contract Testing (`tests/test_api.py`)
- Test every endpoint (`/health`, `/api/analyze`, `/api/clarify`, `/api/resolve`, `/api/conversations`, `/api/evaluation`) using FastAPI `TestClient`.
- Verify status codes (`200`, `400`, `404`, `422`, `502`, `503`) and exact JSON error schema.

### D. Edge-Case Testing Checklist
1. **Empty input:** `""` or `"   "` -> `422 VALIDATION_ERROR`.
2. **Very long input:** `> 2000` characters -> `422 VALIDATION_ERROR`.
3. **Clear instructions:** *"Convert 100 kilometres to metres."* -> `needs_clarification=false`, `status="RESOLVED"`.
4. **Multiple interpretations:** Ambiguous phrasing returns 2–4 distinct interpretations.
5. **Multiple clarification turns:** Partial user reply triggers turn 2 follow-up; complete reply resolves on turn 3.
6. **Missing context:** Context-dependent input (*"Send it to him."*) without prior turns -> flagged `context_dependent` and asks for missing referent.
7. **Invalid conversation IDs:** Unknown UUID on `/api/clarify` or `/api/resolve` -> `404 CONVERSATION_NOT_FOUND`.
8. **Gemini API failures:** Timeout or 503 -> `503 AI_SERVICE_UNAVAILABLE` with no stack trace leaked.
9. **Malformed model responses:** Invalid JSON / schema mismatch -> retried once, then `502 AI_SERVICE_ERROR`.
10. **Repeated clarification questions:** Mocked AI returning an already-asked question is filtered out by `ClarificationEngine`.

---

## 2. Evaluation Dataset Plan

- **Target Size for 24-Hour Hackathon:** **48 labelled examples** (12 per category).
  - **Trade-off:** 48 examples is large enough to compute meaningful Precision, Recall, F1, and False Clarification Rate while keeping live Gemini API evaluation under ~1–2 minutes and well within free-tier rate limits.
- **Categories (12 each):**
  1. `ambiguous` (referential / lexical ambiguity — expected `needs_clarification=true`)
  2. `incomplete` (underspecified action — expected `needs_clarification=true`)
  3. `context_dependent` (anaphoric/situational — expected `needs_clarification=true` without prior context, `false` when context supplied)
  4. `clear` (self-contained instructions — expected `needs_clarification=false`)
- **Format (`tests/eval_dataset.json`):**
  Each item includes `id`, `instruction`, `optional_context`, `expected_classification`, `expected_needs_clarification`, `expected_action`, and `simulated_clarification_reply` (for multi-turn resolution scoring).

---

## 3. Evaluation Metrics

All metrics are computed strictly from actual evaluation script runs and persisted in `evaluation_records` (never fabricated):

1. **Ambiguity Detection Precision:**  
   $$\text{Precision} = \frac{TP}{TP + FP}$$  
   (Positive = `needs_clarification == true`).
2. **Ambiguity Detection Recall:**  
   $$\text{Recall} = \frac{TP}{TP + FN}$$
3. **Ambiguity Detection F1 Score:**  
   $$F_1 = \frac{2 \times \text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$$
4. **False Clarification Rate (FCR):**  
   $$\text{FCR} = \frac{FP}{FP + TN}$$  
   (Fraction of `clear` instructions that were unnecessarily asked clarification questions).
5. **Resolution Accuracy:**  
   Fraction of test cases whose final `resolved_intent.action` and required parameters match the ground-truth expected intent.
6. **Clarification Relevance:**  
   Evaluated on a 0/1 or 1–3 rubric (or automated LLM-as-judge / human spot-check on the 36 unclear cases) verifying whether the generated question directly targets `missing_required_info`.

---

## 4. Baseline Comparison

Compare **ResolveX** (structured taxonomy + `ContextAnalyzer` + `ClarificationEngine` + deterministic validation) against a **Zero-Shot Single-Prompt Baseline**:
- **Baseline:** A minimal single prompt to the configured `GEMINI_MODEL` (e.g., `gemini-3.8-flash`) asking *"Is this instruction clear or unclear? Respond in JSON."* without ambiguity category definitions, anti-overclarification guardrails, or multi-turn deduplication.
- **Hypothesis to Test:** ResolveX should achieve a **lower False Clarification Rate** on `clear` instructions and **higher Resolution Accuracy** on multi-turn `incomplete`/`context_dependent` instructions.
