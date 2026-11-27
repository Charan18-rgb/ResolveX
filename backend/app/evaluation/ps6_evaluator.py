"""
PS6 evaluator — runs the labelled & adversarial dataset through the analysis engine,
computes precision/recall/F1/accuracy/clarification-efficiency + Baseline comparison,
and persists evaluation records without fabricating results or masking fallbacks.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
import re
from typing import Any
import uuid

from app.config import get_settings
from app.database import operations as db_ops
from app.services.conversation_service import continue_conversation, start_conversation

DATASET_PATH = (
    Path(__file__).parent.parent.parent / "tests" / "evaluation" / "ps6_dataset.json"
)

_BASELINE_AMBIG_REGEX = re.compile(
    r"\b(it|they|them|him|her|this|that|soon|later|asap|something|anything)\b",
    re.IGNORECASE,
)


def _load_dataset(adversarial_only: bool = False) -> list[dict[str, Any]]:
    with open(DATASET_PATH, encoding="utf-8") as fh:
        data = json.load(fh)
    if adversarial_only:
        return [item for item in data if item.get("is_adversarial")]
    return data


def _compute_metrics_from_counts(
    tp: int, fp: int, tn: int, fn: int, correct_class: int, total: int
) -> dict[str, Any]:
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    resolution_accuracy = correct_class / total if total > 0 else 0.0
    false_clarification_rate = fp / total if total > 0 else 0.0
    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "resolution_accuracy": round(resolution_accuracy, 4),
        "false_clarification_rate": round(false_clarification_rate, 4),
        "true_positives": tp,
        "true_negatives": tn,
        "false_positives": fp,
        "false_negatives": fn,
    }


def _evaluate_naive_baseline(dataset: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Evaluate a simple single-turn keyword/pronoun baseline over the exact same dataset
    for side-by-side comparison against ResolveX (no LLM reasoning, no multi-turn optimization).
    """
    tp = fp = tn = fn = correct_class = 0
    for item in dataset:
        instruction = str(item.get("instruction", ""))
        expected_needs = bool(item.get("expected_needs_clarification", False))
        expected_class = str(item.get("expected_classification", "ambiguous"))

        predicted_needs = bool(_BASELINE_AMBIG_REGEX.search(instruction))
        predicted_class = "ambiguous" if predicted_needs else "clear"

        if expected_needs and predicted_needs:
            tp += 1
        elif not expected_needs and not predicted_needs:
            tn += 1
        elif not expected_needs and predicted_needs:
            fp += 1
        else:
            fn += 1

        if predicted_class == expected_class:
            correct_class += 1

    metrics = _compute_metrics_from_counts(tp, fp, tn, fn, correct_class, len(dataset))
    return {
        "name": "Naive Keyword Baseline (Single-Turn Regex)",
        "clarification_efficiency": 0.0,
        **metrics,
    }


def run_ps6_evaluation(
    db_path: str, adversarial_only: bool = False
) -> dict[str, Any]:
    """
    Run the PS6 dataset (or focused adversarial subset), compute precision/recall/F1,
    clarification efficiency, baseline comparison, and granular failure diagnostics.
    """
    dataset = _load_dataset(adversarial_only=adversarial_only)
    settings = get_settings()

    true_positives = 0
    false_positives = 0
    true_negatives = 0
    false_negatives = 0
    correct_classifications = 0
    fallback_count = 0

    efficient_resolutions = 0
    expected_clarify_total = 0

    category_stats: dict[str, dict[str, int]] = {}
    results_detail: list[dict[str, Any]] = []
    eval_conversation_ids: list[str] = []

    for item in dataset:
        instruction = str(item["instruction"])
        expected_needs_clarification = bool(item["expected_needs_clarification"])
        expected_classification = str(item["expected_classification"])
        expected_ambig_types = [str(t).lower() for t in item.get("expected_ambiguities", [])]
        ambig_cat = str(item.get("ambiguity_category", expected_classification))
        follow_up = item.get("follow_up_clarification")

        predicted_needs = True
        predicted_class = "unknown"
        detected_types: list[str] = []
        turns_taken = 1
        final_status = "FAILED"
        abstained = False
        provenance = "live_backend"
        failure_reasons: list[str] = []

        try:
            response = start_conversation(db_path, instruction)
            eval_conversation_ids.append(response.conversation_id)
            predicted_needs = bool(response.needs_clarification)
            predicted_class = response.classification or "unknown"
            detected_types = [t.lower() for t in response.ambiguity_types]
            turns_taken = response.turn_count
            final_status = response.status
            if response.confidence_assessment is not None:
                abstained = response.confidence_assessment.abstained
                provenance = response.confidence_assessment.provenance
                if provenance == "ai_unavailable_abstained":
                    fallback_count += 1

            # Multi-turn follow-up verification if case supplies a clarification answer
            if follow_up and response.status == "NEEDS_CLARIFICATION":
                turn2 = continue_conversation(
                    db_path, response.conversation_id, str(follow_up)
                )
                turns_taken = turn2.turn_count
                final_status = turn2.status
                if turn2.confidence_assessment is not None:
                    abstained = turn2.confidence_assessment.abstained
                    provenance = turn2.confidence_assessment.provenance
        except Exception as exc:
            failure_reasons.append(f"Backend execution error: {exc}")

        if expected_needs_clarification and predicted_needs:
            true_positives += 1
        elif not expected_needs_clarification and not predicted_needs:
            true_negatives += 1
        elif not expected_needs_clarification and predicted_needs:
            false_positives += 1
            failure_reasons.append(
                "False Positive: clear instruction unnecessarily triggered clarification."
            )
        elif expected_needs_clarification and not predicted_needs:
            false_negatives += 1
            failure_reasons.append(
                "Missed Ambiguity (False Negative): ambiguous input was marked clear without clarification."
            )

        if predicted_class == expected_classification:
            correct_classifications += 1
        elif expected_needs_clarification == predicted_needs:
            failure_reasons.append(
                f"Classification mismatch: expected '{expected_classification}', got '{predicted_class}'."
            )

        if expected_needs_clarification:
            expected_clarify_total += 1
            if follow_up and final_status == "RESOLVED" and turns_taken <= 2:
                efficient_resolutions += 1
            elif not follow_up and predicted_needs and turns_taken <= 2:
                efficient_resolutions += 1

        missed_types = [t for t in expected_ambig_types if t not in detected_types]
        extra_types = (
            [t for t in detected_types if expected_ambig_types and t not in expected_ambig_types]
            if not expected_needs_clarification
            else []
        )
        matched_types = [t for t in expected_ambig_types if t in detected_types]
        resolution_failed = bool(
            (follow_up and final_status != "RESOLVED")
            or (expected_needs_clarification != predicted_needs)
        )

        if missed_types:
            failure_reasons.append(
                f"Missed expected ambiguity tag(s): {', '.join(missed_types)}."
            )
        if provenance == "ai_unavailable_abstained":
            failure_reasons.append(
                "AI unavailable during run — deterministic fallback active (not live model accuracy)."
            )

        bucket = category_stats.setdefault(
            ambig_cat, {"total": 0, "passed": 0, "fp": 0, "fn": 0}
        )
        bucket["total"] += 1
        if expected_needs_clarification == predicted_needs:
            bucket["passed"] += 1
        elif predicted_needs:
            bucket["fp"] += 1
        else:
            bucket["fn"] += 1

        results_detail.append({
            "id": item["id"],
            "instruction": instruction,
            "ambiguity_category": ambig_cat,
            "is_adversarial": bool(item.get("is_adversarial", False)),
            "tags": item.get("tags", []),
            "expected_classification": expected_classification,
            "predicted_classification": predicted_class,
            "expected_needs_clarification": expected_needs_clarification,
            "predicted_needs_clarification": predicted_needs,
            "expected_ambiguities": expected_ambig_types,
            "detected_ambiguities": detected_types,
            "correct_detections": matched_types,
            "missed_ambiguities": missed_types,
            "false_positives": extra_types
            + (["Unnecessary clarification"] if not expected_needs_clarification and predicted_needs else []),
            "resolution_failed": resolution_failed,
            "turns_taken": turns_taken,
            "final_status": final_status,
            "abstained": abstained,
            "provenance": provenance,
            "failure_explanation": " ".join(failure_reasons) if failure_reasons else None,
        })

    total = len(dataset)
    resolvex_metrics = _compute_metrics_from_counts(
        true_positives,
        false_positives,
        true_negatives,
        false_negatives,
        correct_classifications,
        total,
    )
    clarification_efficiency = (
        round(efficient_resolutions / expected_clarify_total, 4)
        if expected_clarify_total > 0
        else 1.0
    )
    baseline_metrics = _evaluate_naive_baseline(dataset)

    run_id = str(uuid.uuid4())
    db_ops.save_evaluation_record(
        db_path,
        run_id=run_id,
        model_name=settings.gemini_model,
        dataset_size=total,
        precision=resolvex_metrics["precision"],
        recall=resolvex_metrics["recall"],
        f1_score=resolvex_metrics["f1_score"],
        resolution_accuracy=resolvex_metrics["resolution_accuracy"],
        false_clarification_rate=resolvex_metrics["false_clarification_rate"],
    )

    # Benchmark runs must not pollute the user's chat history: remove every
    # conversation this run created (cascades to messages/interpretations/etc.).
    cleaned = 0
    for cid in eval_conversation_ids:
        try:
            if db_ops.delete_conversation(db_path, cid):
                cleaned += 1
        except Exception:
            pass

    return {
        "eval_conversations_cleaned": cleaned,
        "run_id": run_id,
        "model": settings.gemini_model,
        "dataset_size": total,
        "adversarial_only": adversarial_only,
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "ai_configured": settings.is_ai_configured,
        "fallback_cases_count": fallback_count,
        "provenance": (
            "ai_fallback_mixed" if fallback_count > 0 else "live_backend_evaluated"
        ),
        **resolvex_metrics,
        "clarification_efficiency": clarification_efficiency,
        "baseline_comparison": baseline_metrics,
        "category_breakdown": category_stats,
        "results_detail": results_detail,
    }
