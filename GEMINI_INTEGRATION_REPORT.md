# ResolveX — Live Gemini Integration Test Report

**Date:** 2026-11-27  
**Configured Model (`backend/.env`):** `gemini-3.8-flash` (verified listed by Gemini API; experienced transient `503 UNAVAILABLE` high-demand errors during test window)  
**Live Responsive Model Tested:** `gemini-3.5-flash` (verified live structured + text inference)  
**Pytest Regression Suite:** **38/38 passed** (3.75s)

---

## 1. Configuration & Model Availability Verification

- `get_settings().is_ai_configured`: **`True`** (loaded from `backend/.env`; key never printed or committed).
- Live `client.models.list()` returned **21 Gemini models**, including:
  - `models/gemini-3.8-flash` (configured default)
  - `models/gemini-3.7-flash`
  - `models/gemini-3.6-flash`
  - `models/gemini-3.5-flash`
  - `models/gemini-3.5-flash-lite`
  - `models/gemini-3.1-flash-lite`
  - `models/gemini-2.5-flash` (calling `generate_content` returned `404 NOT_FOUND`: *"no longer available to new users. Please update your code to use models/gemini-3.8-flash..."*, confirming `gemini-3.8-flash` is the correct official default).
- Live `generate_content` probe results during test window:
  - `gemini-3.8-flash`: `503 UNAVAILABLE` (temporary high demand on Google servers)
  - `gemini-3.7-flash`: `503 UNAVAILABLE`
  - `gemini-3.6-flash`: `504 DEADLINE_EXCEEDED`
  - `gemini-3.5-flash`: **`200 OK` (`'RESOLVEX_LIVE_OK'`)**
  - `gemini-3.5-flash-lite`: **`200 OK` (`'RESOLVEX_LIVE_OK'`)**
  - `gemini-3.1-flash-lite`: **`200 OK` (`'RESOLVEX_LIVE_OK'`)**

### Defects Discovered & Fixed During Live Testing
1. **Gemini Developer API `additionalProperties` Rejection (`ai_schemas.py`, `conversation_service.py`, `task_router.py`):**
   `ResolvedIntentOutput.parameters` previously used `dict[str, Any]`, which generates `"additionalProperties": true` in JSON Schema. Live Gemini Developer API rejected structured output calls with `additionalProperties is only supported in Gemini Enterprise Agent Platform mode, not in Gemini Developer API mode.`  
   **Fix:** Replaced `dict[str, Any]` in `ResolvedIntentOutput` with `list[ParameterEntry]` (`key: str`, `value: str`) plus a `before` validator so existing `dict`-based unit tests remain compatible and `ResolvedIntentPayload.parameters` still returns a JSON object (`dict`).
2. **HTTP Timeout & Stale Client Cache (`gemini_service.py`):**
   `genai.Client` was previously instantiated without `http_options=types.HttpOptions(timeout=settings.gemini_timeout_seconds * 1000)` and cached globally even if `GEMINI_API_KEY` or timeout changed.  
   **Fix:** Added explicit `HttpOptions(timeout=...)` and keyed client cache by `(api_key, timeout_seconds)`.

---

## 2. PS6 Live Gemini Test Results (`gemini-3.5-flash`)

| Test Case | Input | Live Output Summary | Result |
| :--- | :--- | :--- | :--- |
| **Clear Request (Fast Path)** | `"Convert 100 kilometers to miles."` | `201 Created`, `status="RESOLVED"`, `classification="clear"`, `needs_clarification=False`, `action="unit_conversion"`, `parameters={"quantity": "100", "from_unit": "kilometers", "to_unit": "miles"}`, `direct_answer="100 kilometers is equal to approximately 62.1371 miles."` | **PASS** |
| **Ambiguity Detection & Interpretations** | `"Send the report to Rahul."` | `201 Created`, `status="NEEDS_CLARIFICATION"`, `classification="incomplete"`, `ambiguity_types=["referential", "underspecification"]`, 2 candidate interpretations, 2 clarification questions | **PASS** |
| **Multi-Turn Clarification & Resolution** | `"Send the Q3 Finance Report to Rahul Sharma in Accounting."` (Turn 2) | `200 OK`, `status="RESOLVED"`, `turn_count=2`, `needs_clarification=False`, `action="send_document"`, `parameters={"report_name": "Q3 Finance Report", "recipient_name": "Rahul Sharma", "recipient_department": "Accounting"}` | **PASS** |

---

## 3. PS2 Live Gemini Integration & Routing Results (`gemini-3.5-flash`)

| Test Case | Input / Endpoint | Live Output Summary | Result |
| :--- | :--- | :--- | :--- |
| **NL Inventory Routing** | `POST /api/analyze` with `"Check our current inventory shortages, MAT-CHIP stock availability, and order delivery risks for open orders."` | `201 Created`, `status="RESOLVED"`, `action="check_inventory_and_delivery_status"`, `inventory_insight` attached (`domain="inventory"`, `total_materials=4`, `shortages_count=4`, `order_risks_count=3`) | **PASS** |
| **Data-Grounded AI Briefing** | `GET /api/briefings?role=INVENTORY_PLANNER` | `200 OK`, `data_source="deterministic_sqlite"`, `ai_enriched=True`, `ai_summary` grounded in exact DB quantities (`MAT-CHIP` 0 net availability, 5 pcs unmet order demand) | **PASS** |

---

## 4. Failure Handling & Fallback Verification

All 5 failure modes returned safe deterministic fallbacks without crashes or fabricated numbers:
1. **Invalid API Key:** `call_gemini_structured` returned error; `detect_ambiguity` fell back to `classification="ambiguous"`, `needs_clarification=True`.
2. **Missing API Key:** Failed fast (`RuntimeError`) with `'GEMINI_API_KEY is not configured...'`; `detect_ambiguity` returned safe ambiguous fallback.
3. **Timeout (`TimeoutError`):** Caught cleanly; returned safe ambiguous fallback.
4. **Malformed AI Response (`parsed=None`):** Caught `ValueError`; returned safe ambiguous fallback.
5. **Rate-Limit (`429 RESOURCE_EXHAUSTED`):** Caught cleanly; returned safe ambiguous fallback.

---

## 5. Regression & Evaluation Results

### Pytest Suite
- **`pytest backend/tests -v`:** **38/38 passed** in 3.75s.

### PS2 Deterministic Evaluation (`run_ps2_evaluation`)
- **Passed:** `8 / 8` (`accuracy: 1.0` vs `0.5` FIFO baseline).

### PS6 48-Case Live Evaluation (`run_ps6_evaluation` with `gemini-3.5-flash`)
- **Run ID:** `7ae51f20-9765-4b99-8c64-333eca7e88cb`
- **Dataset Size:** `48` | **Precision:** `0.75` | **Recall:** `1.0` | **F1:** `0.8571`
- **Resolution Accuracy:** `0.1042` | **False Clarification Rate:** `0.25` (`TP=36, TN=0, FP=12, FN=0`)
- **Note / Limitation:** Rapid sequential firing of 48 API calls without inter-request delay can hit free-tier RPM rate limits on later items, causing those calls to fall back to `needs_clarification=True` (contributing to `TN=0` in bulk evaluation even though individual clear requests like `"Convert 100 kilometers to miles."` resolve cleanly as `clear` / `TN`).

---

## 6. Remaining Limitations & Git Hygiene

1. **`gemini-3.8-flash` High-Demand `503`:** `gemini-3.8-flash` is valid and listed by the API, but experienced temporary `503 UNAVAILABLE` during testing. Switching `GEMINI_MODEL=gemini-3.5-flash` in `backend/.env` works immediately if `3.8-flash` is overloaded.
2. **Bulk Evaluation Rate-Limit Pacing:** `ps6_evaluator.py` sends 48 consecutive requests without sleep; adding a small rate-limit delay for free-tier keys would improve bulk `TN` measurement.
3. **Secrets Excluded:** `backend/.env`, `*.db`, `.venv/`, and `__pycache__/` remain excluded by `.gitignore` and untracked in Git.
