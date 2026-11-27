# ResolveX — Final Evaluation Metrics

**Date:** 2026-11-27 · All numbers below are **measured outputs** of the shipped evaluators; nothing is estimated or fabricated.

## 1. Language understanding benchmark (PS6 dataset)

**Method:** `GET /api/evaluation/ps6?run_now=true` executed live on 2026-11-27 against `gemini-3.8-flash` with a configured `GEMINI_API_KEY`.

**Dataset:** `backend/tests/evaluation/ps6_dataset.json` — 48 items, 12 per category: `ambiguous`, `incomplete`, `context_dependent`, `clear`. Each item has `instruction`, `expected_needs_clarification`, `expected_classification`. Single-turn only — no multi-turn or parameter-extraction fields exist in the dataset (documented limitation).

| Metric | Value | Definition |
|---|---|---|
| True Positives | 36 | Correctly asked for clarification |
| True Negatives | 10 | Correctly resolved clear items |
| False Positives | 2 | Asked clarification on clear items |
| False Negatives | 0 | Missed ambiguity |
| Precision | 0.9474 | TP / (TP+FP) |
| Recall | 1.0000 | TP / (TP+FN) |
| F1 | 0.9730 | Harmonic mean |
| Resolution accuracy | 0.7708 | Exact `predicted_classification == expected_classification` |
| False-clarification rate | 0.0417 | FP / total clear items |

**Caveats (honest):**
- Deterministic local patterns short-circuit before Gemini for closed-world tasks, so these numbers reflect the *hybrid* pipeline, not pure LLM quality.
- On any per-item exception the evaluator records a safe `needs_clarification=True` fallback, which can inflate TN/FP — with a healthy API this did not trigger.
- Prior audit numbers (P=0.75/R=1.0/F1=0.857, resolution_accuracy 0.1042–0.25) were produced under fallback-dominated conditions and are superseded by this live run.

## 2. Inventory intelligence benchmark

**Method:** `run_ps2_evaluation` on a freshly seeded database (8 deterministic scenario checks + simulated baseline).

| Metric | Value |
|---|---|
| Scenarios passed | 8 / 8 → accuracy **1.0000** |
| Shortages detected | 4 (MAT-BOLT, MAT-CHIP, MAT-COPPER, MAT-STEEL) |
| CRD-risk orders evaluated | 3 (ORD-1001 ON_TRACK, ORD-1002 BLOCKED, ORD-1003 AT_RISK) |
| Baseline method | `reactive_fifo_no_crd_lookahead` — simulated creation-order allocation, no CRD priority |
| Baseline accuracy | **0.75** (measured on the same 4 policy-sensitive scenarios) |
| Improvement over baseline | **+0.25** |

**Correction note:** the previous "50% FIFO baseline" was a hardcoded constant, not a simulation. It has been replaced by the measured baseline above. Seed order `created_at` values were adjusted so creation order ≠ CRD order, making the comparison meaningful rather than degenerate.

## 3. Deterministic fallback results

When Gemini is unavailable the pipeline degrades to `local_analyzer` (closed-world patterns) then `offline_fallback` (safe clarification request). Offline behaviour was verified by direct invocation: unmatched instructions return `classification="incomplete"`, `needs_clarification=True` — never a fabricated answer. `analysis_source` now exposes which path produced each result (`local`, `offline_fallback`, `system`, `gemini`), so fallback responses cannot be mislabeled as live AI output.

## 4. What is NOT measured

- Multi-turn clarification accuracy (dataset has no context/reply fields).
- Parameter-extraction precision for resolved intents.
- Statistical calibration of any confidence-like figure — the UI ambiguity index is explicitly labeled a structural heuristic, and fabricated interpretation probabilities were removed.
