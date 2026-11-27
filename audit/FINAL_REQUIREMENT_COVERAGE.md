# ResolveX — Final Requirement Coverage

**Date:** 2026-11-27 · **Method:** code inspection + live API verification + test suites.

## Natural-language intelligence

| Requirement | Status | Evidence |
|---|---|---|
| Clear instructions resolve directly | ✅ | Unit conversion, inventory lookups resolve without questions (live) |
| Ambiguous → identify what's unclear + alternatives | ✅ | "Send the report to Rahul." → 2 targeted questions + interpretations |
| Missing info → ask only what's needed | ✅ | Send-request asks only for missing document/recipient |
| Contradictory → identify conflict | ✅ (fixed F-01) | "cancel…and confirm…" → clarification, no silent choice |
| Referential/context-dependent | ✅ | Pronoun/context cases in 48-item dataset; follow-ups via `/api/clarify` |
| Multiple intents | ✅ (fixed F-02) | Compound request → "which first?" → context-aware resolution verified |
| Follow-up context | ✅ | SQLite-persisted conversations; verified clarify→resolve flow |
| Incomplete/typo/grammar | ✅ | "shortges" resolved via Gemini; offline → safe clarification |
| Unsupported requests | ✅ | Capability-boundary answer, honest "cannot complete" |
| No invented data | ✅ | Inventory answers DB-grounded; general AI answers labeled unverified |
| No clarification loops | ✅ | Question dedup + max-turns force-resolution + partial-resolution escape |
| Structured output validation | ✅ | Pydantic schemas + `validate_resolved_intent`; Gemini `response_schema` constrained |

## Inventory intelligence

| Requirement | Status | Evidence |
|---|---|---|
| On-hand/incoming/allocated/net available | ✅ | `net = on_hand + incoming − allocated`, deterministic |
| Safety stock / reorder threshold | ✅ | LOW_STOCK/OUT_OF_STOCK/HEALTHY statuses |
| Shortage detection | ✅ | unmet demand + threshold triggers; 4 demo shortages live |
| Allocation priority / earliest-CRD | ✅ | CRD-first, tie-broken by created_at/id; verified vs measured FIFO baseline |
| CRD risk / projected ship | ✅ | ON_TRACK/AT_RISK/DELAYED/BLOCKED + UNAVAILABLE handling (invalid CRD, missing BOM) |
| Event processing | ✅ | Idempotent (UNIQUE event_id), malformed quarantine, validation hardened (F-11) |
| Alerts + acknowledgement | ✅ | Severity-ranked, dedup window, 404 on missing ack |
| PO proposals → approval → rejection | ✅ | PENDING_APPROVAL gate; role check backend-side (403 verified); audit log; race-safe decision |
| Role briefings | ✅ | Role-focused deterministic sections + optional AI narrative (`ai_enriched` flag honest) |

## Explainability

| Requirement | Status |
|---|---|
| Facts vs AI interpretations vs assumptions vs recommendations vs pending/completed vs sources | ✅ Ledger sections; provenance via `analysis_source` |
| Evidence linked to inputs/records/calculations | ✅ `inventory_insight.explanation` generated only from engine outputs |
| No invented explanations | ✅ Fixed (F-16); heuristic score labeled |
| Confidence only when defensible | ✅ Fabricated probabilities removed (F-17) |

## UX / platform

| Requirement | Status |
|---|---|
| Unified single application | ✅ Shared assistant uses same `/api/analyze`,`/api/clarify` services |
| No hackathon terminology in UI | ✅ PS2/PS6 removed from tags, notifications, docs strings (F-07,F-15) |
| Navigation, states, errors, mobile | ✅ Routes verified 200; loading/empty/error states present; mobile audited previously, re-verified build |
| Settings/dev diagnostics | ✅ Confined to Settings page, labeled |
| Reliable startup | ✅ Health endpoint + SSR 200s verified |
| Secure secrets | ✅ `.env`, `*.db` gitignored; no tracked secrets |

## Known gaps (documented, not hidden)

- Real authentication/identity (demo role headers only).
- Multi-turn evaluation metrics not measured.
- `incoming` excluded from physical allocation (policy, documented).
- Event-driven stock reservations overwritten by allocation recalc.
