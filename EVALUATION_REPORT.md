# ResolveX — Evaluation Report (Language + Inventory)

*Updated 2026-11-27 with measured results. See `audit/FINAL_EVALUATION_METRICS.md` for full methodology and caveats.*

## 1. Language Evaluation (48-case ambiguity dataset)

**Dataset:** `backend/tests/evaluation/ps6_dataset.json` — 48 items (12 each: ambiguous, incomplete, context_dependent, clear). Single-turn.

**Live run — `gemini-3.8-flash`, 2026-11-27:**

| Metric | Value |
|---|---|
| Precision | 0.9474 |
| Recall | 1.0000 |
| F1 | 0.9730 |
| Resolution accuracy | 0.7708 |
| False-clarification rate | 0.0417 |
| Confusion | TP=36, TN=10, FP=2, FN=0 |

Reproduce: `GET /api/evaluation/ps6?run_now=true`.

## 2. Inventory Evaluation (deterministic scenarios)

**Method:** `run_ps2_evaluation` on seeded demo data; 8 scenario checks + simulated baseline.

| Metric | Value |
|---|---|
| Scenario accuracy | 8/8 = 1.0000 |
| Shortages detected | 4 |
| CRD-risk orders evaluated | 3 |
| Baseline | Measured reactive-FIFO simulation (no CRD lookahead) |
| Baseline accuracy | 0.75 (policy-sensitive subset) |
| Improvement | +0.25 |

Reproduce: `GET /api/evaluation/ps2?run_now=true`.

## 3. Deterministic fallback

With Gemini unavailable, `local_analyzer` closed-world patterns and `offline_fallback` produce safe clarifications (`analysis_source` = `local`/`offline_fallback`). No fabricated answers.
