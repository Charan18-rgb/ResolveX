# ResolveX — Final Test Results

**Date:** 2026-11-27 · All commands run locally on Windows, Python 3.14 venv, Node/Vite toolchain.

## 1. Automated suites

| Suite | Command | Result |
|---|---|---|
| Backend pytest | `backend/.venv/Scripts/pytest.exe backend/tests -q` | **40/40 PASSED** (multiple runs; final full run 40 passed) |
| Frontend Vitest | `npx vitest run` | **3/3 PASSED** |
| TypeScript | `npx tsc --noEmit` | **0 errors** |
| Production build | `npm run build` | **PASSED** (Vite client + Nitro SSR) |
| Backend startup | `uvicorn app.main:app --port 8000` | `GET /health` → `{"status":"ok","database":"connected","ai_configured":true}` |
| Frontend startup | `npm run dev` | `http://localhost:8080` `/` and `/inventory` → HTTP 200, SSR renders |

## 2. Mandatory demonstration scenarios (live, post-fix)

| # | Scenario | Result | Status |
|---|---|---|---|
| 1 | "Convert 100 kilometers to miles." | RESOLVED `unit_conversion` = 62.1371 mile, source `local` | PASS |
| 2 | "Send the report to Rahul." | NEEDS_CLARIFICATION, 2 questions, source `gemini` | PASS |
| 3 | Clarify with "Send the Q3 Finance Report to Rahul Sharma in Accounting." | RESOLVED `send_document`, params extracted | PASS |
| 4 | "Show me our current inventory shortages." | RESOLVED; 4 materials, unmet demand, suggested PO qty — DB figures | PASS |
| 5 | "Which orders are at risk of missing their delivery dates?" | RESOLVED; ORD-1002 BLOCKED, ORD-1003 AT_RISK, ORD-1001 ON_TRACK | PASS |
| 6 | "Check MAT-CHIP availability and its impact on upcoming orders." | RESOLVED; net 0 OUT_OF_STOCK, ORD-1002 BLOCKED, verified explanation | PASS |
| 7 | PO approve with `X-User-Role: INVENTORY_PLANNER` | HTTP 403 FORBIDDEN | PASS |
| 8 | Gemini failure simulation | Deterministic `local`/`offline_fallback` clarification; no crash/false success (pytest + code path verified) | PASS |

## 3. Adversarial / edge cases (live)

| Case | Expected | Observed | Status |
|---|---|---|---|
| "cancel order MAT-CHIP and confirm shipment tomorrow" | Detect conflict | NEEDS_CLARIFICATION "both to cancel and to confirm" (was: silent misresolution) | PASS (fixed) |
| "show inventory and convert 5 km to miles" | Handle both intents | NEEDS_CLARIFICATION "which first" → follow-up "handle the inventory one first" → RESOLVED `show_inventory` w/ DB answer | PASS (fixed) |
| "show me shortges" (typo) | Resolve shortages | RESOLVED `check_shortages` (Gemini) | PASS |
| "what is the weather today" | Honest boundary | RESOLVED `unsupported_request` capability message | PASS |
| "send it to him" (no context) | Clarify | NEEDS_CLARIFICATION, asks document + recipient | PASS |
| Invalid CRD order | No 500 | BLOCKED/UNAVAILABLE with explanation (unit-level fix; covered by code path) | PASS |
| Duplicate/malformed events | Quarantine, no 500 | IntegrityError + validation → MALFORMED + FEED_FAILURE alert | PASS (pytest) |

## 4. Evaluation measurements (this session)

### Language benchmark — live Gemini (`gemini-3.8-flash`)

- Dataset: 48 labelled items (`backend/tests/evaluation/ps6_dataset.json`; 12 per class: ambiguous, incomplete, context_dependent, clear). Single-turn only.
- Confusion: TP=36, TN=10, FP=2, FN=0
- Precision 0.9474 · Recall 1.0000 · F1 0.9730
- Resolution accuracy 0.7708 · False-clarification rate 0.0417
- Duration ≈ 204 s; results persisted + returned by `GET /api/evaluation/ps6`.

### Inventory benchmark — deterministic

- 8/8 scenario checks pass → accuracy 1.0 (4 net-availability, shortage detection, 2 CRD-risk, allocation).
- **Measured** reactive-FIFO baseline (no CRD lookahead): 0.75 on the 4 policy-sensitive scenarios → improvement **+0.25**. Replaces previously hardcoded 0.5.

## 5. Blocked / untested

- Playwright browser automation: not re-run this cycle (previously 0 page errors); pages verified via HTTP 200 + SSR + manual code review. Screenshots in `audit/screenshots/` predate this cycle's copy changes — visual regression not re-captured.
- Multi-turn evaluation metrics: dataset lacks context/reply fields — untested by design.
- Load/concurrency testing: not performed (SQLite demo scope).
