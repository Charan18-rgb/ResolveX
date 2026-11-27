# ResolveX — Final Defect Register

**Date:** 2026-11-27 · **Method:** independent code inspection + live reproduction + regression tests.

## Fixed in this audit cycle

| ID | Severity | Component | Defect | Fix |
|---|---|---|---|---|
| F-01 | High | `core/local_analyzer.py` | Contradictory requests ("cancel X and confirm Y") silently resolved as inventory lookups — `_inventory_query` ran before `_contradiction`; substring matching also false-positived on "approved/rejected" filters | `_contradiction` runs first on raw instruction, exact-word regex, authoritative → deterministic clarification |
| F-02 | High | `core/local_analyzer.py` | Multiple intents in one instruction silently dropped ("show inventory and convert…" → only conversion) | Multi-intent detection → clarification listing each request; authoritative on turn 1, non-authoritative on clarification turns |
| F-03 | Medium | `core/local_analyzer.py` | Stale context: keywords from earlier turns could trigger `_unsupported`/`_contradiction` on later turns | Contradiction evaluated on raw instruction only |
| F-04 | Medium | `services/conversation_service.py`, `models/schemas.py`, `core/ambiguity_detector.py` | No provenance on analysis results — frontend could not distinguish Gemini vs deterministic vs fallback | `DetectionResult` + `analysis_source` field (`gemini`/`local`/`offline_fallback`/`system`) end-to-end |
| F-05 | Low | `api/analysis_routes.py`, `config.py` | `max_clarification_turns` setting defined but ignored (hardcoded 3) | Wired `settings.max_clarification_turns` into `continue_conversation` |
| F-06 | Medium | `api/analysis_routes.py` | HTTP 500 responses leaked raw exception text | Generic messages + `logger.exception` |
| F-07 | Low | `api/*.py` (AUD-09) | OpenAPI tags/docstrings exposed PS2/PS6 | Renamed to domain labels; `/docs` clean |
| F-08 | High | `inventory/order_risk_engine.py` | Invalid `customer_request_date` → HTTP 500; `processing_days or 1` mishandled 0/negative; BOM-less orders silently ON_TRACK; stale allocations after events | Safe date parse → BLOCKED/UNAVAILABLE; `max(0,…)`; missing-BOM → AT_RISK/UNAVAILABLE; `recalculate_allocations` before evaluation |
| F-09 | Medium | `inventory/shortage_detector.py` | `recommended_purchase_qty` always added full reorder threshold → over-procurement; acknowledged alerts immediately re-created → spam | Formula → `max(unmet−incoming,0)+max(threshold−net,0)`; 24h re-notify window |
| F-10 | Medium | `api/alerts_routes.py` | `ORDER BY severity DESC` alphabetical → CRITICAL sorted last | Explicit severity rank CASE in both queries |
| F-11 | High | `inventory/event_processor.py` | `sqlite3.IntegrityError` escaped as HTTP 500, event unrecorded; invalid CRD accepted; duplicate order ids crashed; malformed-id ms collisions | IntegrityError → MALFORMED quarantine; ISO date + duplicate validation; UUID fallback ids |
| F-12 | Medium | `inventory/purchase_order_engine.py` | Dedup only vs `PENDING_APPROVAL` → rejected materials re-proposed forever | Skip materials with any proposal < 7 days old |
| F-13 | Medium | `services/approval_service.py` | Check-then-act race allowed double decisions; note implied supplier contact enabled | Conditional UPDATE + rowcount guard; honest note |
| F-14 | High | `evaluation/ps2_evaluator.py` | `baseline_accuracy = 0.5` hardcoded constant presented as measured FIFO baseline | Real FIFO simulation; seed `created_at` now diverges from CRD order → measured baseline 0.75 vs 1.0 |
| F-15 | Medium | Frontend (12+ files) | User-facing jargon: SQLite, FastAPI, uvicorn, X-User-Role, HTTP codes, PS2/PS6 categories, mock-dataset labels, partial UUIDs, "Mock client simulation" footer, placeholder github.com links | All replaced with user-facing terminology; categories → Inventory/Language; links → real repo |
| F-16 | High | `components/resolvex/ExplainabilityLedger.tsx` | Invented explanations: hardcoded assumptions, unconditional guardrail claims, heuristic score shown as fact, "SQLite"/"Gemini" labels regardless of provenance | Rewritten: provenance-driven sources, verified-only facts, unverified AI answers labeled, heuristic labeled |
| F-17 | Medium | `services/api.ts`, `routes/interpretations.tsx` | Fabricated interpretation probabilities (`100/n` equal split) rendered as % | `probability` optional; omitted for live analyses; UI hides when absent |

## Prior audit defects — status

| ID | Status |
|---|---|
| AUD-01 Explainability | FIXED (ledger now evidence-provenance based) |
| AUD-02 Answer-source attribution | FIXED + extended via `analysis_source` |
| AUD-03 Role-header precedence | Still fixed (verified) |
| AUD-04 Stale mock/live banner | Still fixed |
| AUD-05 Briefing formatting | Still fixed |
| AUD-06 UI jargon | Fixed again comprehensively (F-15) |
| AUD-07 Alert ack 404 | Still fixed |
| AUD-08 SSR hydration | Still fixed (tsc/build clean) |
| AUD-09 PS2/PS6 API metadata | FIXED (F-07) |

## Open / accepted limitations

| ID | Severity | Item |
|---|---|---|
| L-01 | High | No real authn/authz — role headers self-asserted (demo-only, documented in Settings) |
| L-02 | Medium | `allocated` double-sourced: event reservations overwritten by allocation recalc |
| L-03 | Medium | Allocation ignores `incoming` while net availability counts it |
| L-04 | Low | GET endpoints with write side-effects (`/briefings`, evaluation `run_now`) |
| L-05 | Low | PS6 dataset single-turn; multi-turn accuracy unmeasured |
| L-06 | Low | General-domain AI `direct_answer` unverified (now labeled) |
| L-07 | Low | Frontend 30s timeout < worst-case Gemini cascade (~60s) |
