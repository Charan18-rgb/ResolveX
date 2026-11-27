# ResolveX — Final Technical Report

**Date:** 2026-11-27
**Scope:** Independent re-audit of the full stack (`backend/` FastAPI + SQLite + Gemini, `frontend/` React + TanStack Start), live API verification, regression suites, and adversarial NLP/inventory probing.
**Baseline commit:** `67deb0be1811b64a3ff1a4bf5696b8ad66448443` (verified as both local HEAD and `origin/main` before work began).

---

## 1. Verification of Prior Audit Claims

| Claim | Re-verified result |
|---|---|
| Backend pytest 40/40 | **Confirmed** — 40/40 pass after all changes (run twice, incl. once at 92s full duration). |
| Frontend Vitest 3/3 | **Confirmed** — 3/3 pass. |
| TypeScript 0 errors | **Confirmed** — `npx tsc --noEmit` clean after edits. |
| Production build | **Confirmed** — `npm run build` (Vite client + Nitro SSR) succeeded. |
| 8 demo scenarios | **Confirmed live** — see §4. |
| AUD-01..08 fixes | **Confirmed still working**; explainability further strengthened (see §3). |
| AUD-09 (PS2/PS6 in API metadata) | **Fixed** — tags/docstrings renamed; `/docs` no longer exposes PS2/PS6. |

## 2. Corrections Implemented

### 2.1 Natural-language pipeline (`backend/app/core/`)

- **Contradictory requests were silently misresolved.** `match_local` evaluated `_inventory_query` before `_contradiction`, so "cancel order MAT-CHIP and confirm shipment" resolved as a stock check. `_contradiction` now runs first, uses exact-word regex (so "approved/rejected POs" filter queries do not false-positive), and is authoritative → deterministic clarification. Verified live: now returns `NEEDS_CLARIFICATION` with "The request says both to cancel and to confirm."
- **Multiple intents were silently dropped.** "show inventory and convert 5 km to miles" previously resolved only the conversion. `match_local` now detects ≥2 distinct intent matches and returns a structured clarification listing each detected request. It is authoritative on the first turn (no silent drop even with Gemini up) and non-authoritative on clarification turns so Gemini/the user can select which to handle. Verified live: follow-up "handle the inventory one first" → `RESOLVED` `show_inventory` with DB-grounded answer.
- **Stale-context poisoning reduced:** contradiction detection runs on the raw instruction only, not combined history.
- **`analysis_source` provenance added** to `AnalyzeResponse` (`gemini` | `local` | `offline_fallback` | `system`) via a `DetectionResult` returned by both detector functions. The frontend no longer has to guess whether Gemini produced a result.
- **`max_clarification_turns` setting was ignored** (hardcoded 3). Now wired: `POST /api/clarify` passes `settings.max_clarification_turns`.
- **500 responses leaked raw exception text** (`detail=f"Analysis failed: {exc}"`). Replaced with generic messages + server-side logging.

### 2.2 Inventory intelligence (`backend/app/inventory/`, `api/`)

- **`order_risk_engine`:** unvalidated `date.fromisoformat` crashed with HTTP 500 on bad CRD → now `BLOCKED`/`UNAVAILABLE` with explicit explanation; `processing_days` `or 1` bug (0→1, negatives passed) → clamped `max(0, …)`; orders whose product has **no BOM** were silently treated as fully allocated/ON_TRACK → now flagged `AT_RISK`/`UNAVAILABLE` with explanation; allocations are refreshed (`recalculate_allocations`) before evaluation so event-created orders are assessed on current data.
- **`shortage_detector`:** `recommended_purchase_qty` always added the full reorder threshold on top of unmet demand → systematic over-procurement. Now `max(unmet − incoming, 0) + max(threshold − net_availability, 0)`. Alert dedup previously re-created an alert immediately after acknowledgement → now suppressed for 24h post-acknowledgement.
- **`alerts_routes`:** `ORDER BY severity DESC` sorted **alphabetically** (CRITICAL last) → explicit severity rank in both queries. `data_source` renamed `deterministic_sqlite` → `deterministic_database`; AI-unavailable note de-jargoned.
- **`event_processor`:** only `ValueError` was caught — `sqlite3.IntegrityError` (e.g., duplicate order id) escaped as HTTP 500 and the event was never recorded → now quarantined as `MALFORMED` with `FEED_FAILURE` alert. `ORDER_CREATED` now validates ISO `customer_request_date` and rejects duplicate order ids; `ORDER_UPDATED` validates positive quantity and ISO date; malformed fallback event ids use UUID (same-millisecond collisions eliminated).
- **`purchase_order_engine`:** dedup only checked `PENDING_APPROVAL`, so rejected/approved materials were re-proposed indefinitely → now skips any material with a proposal created within the last 7 days.
- **`approval_service`:** check-then-act race → conditional `UPDATE … WHERE status='PENDING_APPROVAL'` with rowcount guard; approval note corrected (no supplier order is actually sent — previously implied otherwise).

### 2.3 Evaluation honesty (`backend/app/evaluation/`)

- **`ps2_evaluator` baseline was a hardcoded constant `0.5`** presented as a "FIFO baseline". Replaced with a **measured** reactive-FIFO simulation (creation-order allocation, no CRD lookahead) scored on the same policy-sensitive scenarios. Seed `created_at` values now intentionally differ from CRD order so the comparison is meaningful.
- **Measured result (fresh DB):** ResolveX 4/4 policy scenarios (1.0) vs FIFO baseline 3/4 (0.75) → improvement 0.25. Previously claimed "8/8 vs 50% baseline" was not supported by any real baseline.
- **`ps6_evaluator`:** real metrics confirmed (see §5); noted limitations: single-turn dataset, exception fallback inflates TN/FP counts, no pacing.

### 2.4 Frontend (`frontend/src/`)

- **User-facing jargon removed** across `inventory.tsx`, `evaluation.tsx`, `index.tsx`, `DemoBanner.tsx`, `Footer.tsx`, `PromptInputCard.tsx`, `SharedAIAssistant.tsx`, `analysis.tsx`, `clarification.tsx`, `visualization.tsx`, `how-it-works.tsx`, `resolution.tsx`, `ResolveXContext.tsx`, `inventoryMockData.ts`: "SQLite", "FastAPI", "uvicorn", "X-User-Role", "POST /api/…", raw `HTTP` strings, mock-dataset labels, partial conversation UUIDs, and the incorrect "Mock client simulation" footer.
- **`ExplainabilityLedger.tsx` rewritten for provenance:** data-source badges now derive from `backendData.analysis_source`; "Verified Facts" contains only backend-returned figures; AI-generated `direct_answer` for non-inventory domains is explicitly labeled "NOT verified against application data"; the heuristic ambiguity index is labeled as a structural heuristic; invented assumption text removed; guardrails phrased as product facts.
- **Fabricated interpretation probabilities removed:** adapter no longer emits `100/n` fake percentages; `probability` is optional and the UI hides it when absent (demo mock data unchanged).
- **Notification categories** `PS2`/`PS6` → `Inventory`/`Language`.
- **GitHub links** pointed to generic `github.com` → now the real repository.
- **`visualization.tsx`** unconditional "DEMO DATA" badges → conditional "SAMPLE DATA"/"LIVE ANALYSIS".
- **API error strings** made user-friendly; "Sending to Gemini…" → "Sending…".

## 3. Explainability Model (as implemented)

| Layer | Implementation |
|---|---|
| Understanding | `resolved_instruction`, `classification`, `ambiguity_types`, interpretations persisted per turn in SQLite (`conversations`, `messages`, `interpretations`, `clarification_questions`, `resolved_intents`). |
| Detection | `missing_required_info`, `clarification_questions`, ambiguity types — all returned by backend, never invented client-side. |
| Evidence | `inventory_insight` carries `inventory_overview`, `shortages`, `order_risks`, and a deterministic `explanation` string generated by `task_router._explain_inventory` solely from engine outputs; `_attach_verified_answer` overwrites `direct_answer` with it. |
| Calculation | Deterministic Python engines only (availability, allocation, shortage, order risk, events, PO). AI never originates quantities. |
| Recommendation | Shortage `recommended_purchase_qty`, affected orders, lead times — all traceable to DB rows. |
| Execution | PO proposals are `PENDING_APPROVAL` until `ADMIN`/`PROCUREMENT_MANAGER` approves; audit log + approval_records written atomically. |
| Source | New `analysis_source` field distinguishes `gemini` / `local` / `offline_fallback` / `system`; UI labels reflect it. |

## 4. Mandatory Scenarios — Live Re-verification

| # | Scenario | Observed (post-fix) | Status |
|---|---|---|---|
| 1 | "Convert 100 kilometers to miles." | `RESOLVED`, `unit_conversion`, `100 kilometer = 62.1371 mile.`, source=`local` | PASS |
| 2 | "Send the report to Rahul." | `NEEDS_CLARIFICATION`, 2 questions, source=`gemini` | PASS |
| 3 | Clarify → "Send the Q3 Finance Report to Rahul Sharma in Accounting." | `RESOLVED`, `send_document` with extracted params | PASS |
| 4 | "Show me our current inventory shortages." | `RESOLVED`, 4 materials + unmet demand + suggested PO qty from DB | PASS |
| 5 | "Which orders are at risk…?" | `RESOLVED`, ORD-1002 BLOCKED, ORD-1003 AT_RISK, ORD-1001 ON_TRACK | PASS |
| 6 | "Check MAT-CHIP availability and its impact…" | `RESOLVED`, net 0 OUT_OF_STOCK, ORD-1002 BLOCKED, verified explanation | PASS |
| 7 | PO approve as `INVENTORY_PLANNER` | HTTP 403 | PASS |
| 8 | Gemini unavailable | Deterministic `local`/`offline_fallback` path returns safe `NEEDS_CLARIFICATION`; no crash, no false success (also covered by pytest) | PASS |

Adversarial additions verified live: contradiction → clarification; multi-intent → clarification → context-aware resolution; typos ("shortges") resolved via Gemini; unsupported request → honest capability boundary.

## 5. Evaluation Results (measured, this session)

### PS6 language evaluation — live Gemini run (`gemini-3.8-flash`, 2026-11-27)

- Dataset: 48 items (12 each: ambiguous, incomplete, context_dependent, clear) — `backend/tests/evaluation/ps6_dataset.json`.
- TP=36, TN=10, FP=2, FN=0
- Precision **0.9474**, Recall **1.0000**, F1 **0.9730**
- Resolution accuracy **0.7708**, False-clarification rate **0.0417**
- Runtime ≈ 204s for 48 items.

### Inventory evaluation — deterministic (fresh DB)

- 8/8 scenario checks pass (accuracy 1.0).
- Measured FIFO baseline: 0.75 on the 4 policy-sensitive scenarios → improvement **+0.25** (previously a fabricated constant 0.5).

## 6. Startup Verification

- Backend: `uvicorn app.main:app --port 8000` → `GET /health` → `{"status":"ok","database":"connected","ai_configured":true}`.
- Frontend: `npm run dev` → `http://localhost:8080` → `/` and `/inventory` return 200; SSR renders.
- `.env`/`resolvex.db` confirmed gitignored and untracked; no secrets committed.

## 7. Remaining Limitations (honest)

1. **No real authentication.** Roles are self-asserted `X-User-Role`/`X-User-Name` headers — anyone can claim ADMIN. Documented as demo-only on the Settings page; backend enforces role *checks* but not identity.
2. **`allocated` has two writers:** `STOCK_RESERVED`/`STOCK_RELEASED` events mutate it, but `recalculate_allocations` rebuilds it from order allocations — event-driven reservations are overwritten on recalc.
3. **Allocation ignores `incoming`** (on-hand only) while net availability counts incoming — a material can show healthy net availability yet be unallocatable today.
4. **Side effects on GETs:** `/api/briefings` recalculates allocations/risks; `/api/evaluation/*?run_now=true` triggers costly runs — both unauthenticated.
5. **PS6 dataset is single-turn**; multi-turn resolution and parameter-extraction accuracy are not evaluated.
6. **General-domain `direct_answer`** is AI-generated and unverified — now explicitly labeled as such in UI/ledger.
7. **Frontend 30s timeout** vs worst-case backend Gemini cascade (~4 models × 15s) — rare timeouts possible under rate limiting.
8. Dev DBs seeded before the `created_at` change keep old timestamps until re-seeded (fresh installs get the improved seed).
