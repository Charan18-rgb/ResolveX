# ResolveX — Evaluation Report (Language + Inventory)

*Updated 2026-11-27 with measured results. See `audit/FINAL_EVALUATION_METRICS.md` for full methodology and caveats.*

## 1. Language Evaluation (60-case ambiguity dataset)

**Dataset:** `backend/tests/evaluation/ps6_dataset.json` — 60 items including an adversarial subset (lexical, referential, structural, contextual, semantic, underspecification categories plus multi-turn and clear-control tags). Single-turn.

**Live run — `gemini-3.8-flash`, post-merge verified 2026-11-27:**

| Metric | Value |
|---|---|
| Precision | 0.9388 |
| Recall | 0.9787 |
| F1 | 0.9583 |
| Resolution accuracy | 0.7500 |
| False-clarification rate | 0.0500 |
| Confusion | TP=46, TN=10, FP=3, FN=1 |
| Fallback cases | 3 / 60 (provenance: `ai_fallback_mixed`) |
| Naive-regex baseline F1 | 0.4068 |

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
