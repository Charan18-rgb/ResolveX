import { describe, expect, it } from "vitest";
import {
  ADVERSARIAL_BENCHMARK_CASES,
  computeAdversarialSuiteMetrics,
  mapBackendEvalToAdversarialHistory,
  runAdversarialTestCase,
} from "@/data/adversarialTestingEngine";
import type { AdversarialTestCase, BackendEvaluationPs6Response } from "@/types/resolvex";

const noopLive = {
  analyzeLive: async () => ({
    conversationId: "c1",
    status: "NEEDS_CLARIFICATION",
    classification: "ambiguous",
    ambiguityTypes: ["lexical"],
    needsClarification: true,
    interpretations: ["Candidate 1"],
    turnsTaken: 1,
    abstained: false,
    verifiedCorrectness: "unverified" as const,
    provenance: "live_backend" as const,
  }),
  clarifyLive: async () => ({
    status: "RESOLVED",
    classification: "context_dependent",
    ambiguityTypes: [],
    needsClarification: false,
    turnsTaken: 2,
    abstained: false,
    verifiedCorrectness: "verified" as const,
    provenance: "live_backend" as const,
  }),
};

describe("Feature 7: Adversarial Ambiguity Testing Lab (Frontend)", () => {
  it("covers all 6 core categories plus adversarial stress dimensions", () => {
    const categories = new Set(ADVERSARIAL_BENCHMARK_CASES.map((c) => c.category));
    const tags = new Set(ADVERSARIAL_BENCHMARK_CASES.flatMap((c) => c.tags));

    expect(categories).toEqual(
      new Set([
        "lexical",
        "referential",
        "structural",
        "contextual",
        "semantic",
        "underspecification",
        "clear",
      ]),
    );
    expect(tags.has("long_sentence")).toBe(true);
    expect(tags.has("multi_ambiguity")).toBe(true);
    expect(tags.has("missing_context")).toBe(true);
    expect(tags.has("contradictory")).toBe(true);
    expect(tags.has("multi_turn")).toBe(true);
    expect(tags.has("clear_control")).toBe(true);
    expect(tags.has("ps2_inventory")).toBe(true);
  });

  it("never fabricates metrics before tests are executed", () => {
    const { resolveXMetrics, baselineMetrics } = computeAdversarialSuiteMetrics([]);
    expect(resolveXMetrics.executedCount).toBe(0);
    expect(resolveXMetrics.precision).toBeNull();
    expect(resolveXMetrics.recall).toBeNull();
    expect(resolveXMetrics.f1Score).toBeNull();
    expect(baselineMetrics.f1Score).toBeNull();
  });

  it("excludes unlabeled exploratory custom tests from ground-truth F1", async () => {
    const custom: AdversarialTestCase = {
      id: "custom-exp",
      title: "Exploratory",
      instruction: "Handle the urgent client escalation soon.",
      domain: "Enterprise Support",
      category: "contextual",
      tags: [],
      hasValidGroundTruth: false,
      expectedClassification: null,
      expectedNeedsClarification: null,
      expectedAmbiguities: [],
      expectedInterpretations: [],
    };

    const res = await runAdversarialTestCase(custom, {
      mode: "mock",
      apiBaseUrl: "http://localhost:8000",
      ...noopLive,
    });
    expect(res.verdict).toBe("Exploratory (No Ground Truth)");
    const { resolveXMetrics } = computeAdversarialSuiteMetrics([res]);
    expect(resolveXMetrics.executedCount).toBe(1);
    expect(resolveXMetrics.groundedCount).toBe(0);
    expect(resolveXMetrics.precision).toBeNull();
  });

  it("executes full adversarial suite and compares against baseline on same dataset", async () => {
    const results = [];
    for (const tc of ADVERSARIAL_BENCHMARK_CASES) {
      results.push(
        await runAdversarialTestCase(tc, {
          mode: "mock",
          apiBaseUrl: "http://localhost:8000",
          ...noopLive,
        }),
      );
    }

    const { resolveXMetrics, baselineMetrics } = computeAdversarialSuiteMetrics(results);
    expect(resolveXMetrics.executedCount).toBe(ADVERSARIAL_BENCHMARK_CASES.length);
    expect(resolveXMetrics.groundedCount).toBe(ADVERSARIAL_BENCHMARK_CASES.length);
    expect(resolveXMetrics.precision).toBe(1);
    expect(resolveXMetrics.falseClarificationRate).toBe(0);
    expect(resolveXMetrics.f1Score ?? 0).toBeGreaterThan(baselineMetrics.f1Score ?? 0);
  });

  it("reports Execution Error instead of fabricating a pass when live backend is unreachable", async () => {
    const tc = ADVERSARIAL_BENCHMARK_CASES[0]!;
    const res = await runAdversarialTestCase(tc, {
      mode: "fastapi-ready",
      apiBaseUrl: "http://localhost:9999",
      analyzeLive: async () => {
        throw new Error("ECONNREFUSED");
      },
      clarifyLive: noopLive.clarifyLive,
    });

    expect(res.verdict).toBe("Execution Error");
    expect(res.executionError).toContain("ECONNREFUSED");
  });

  it("maps real backend /api/evaluation/ps6 results without fabricating counts", () => {
    const payload: BackendEvaluationPs6Response = {
      source: "fresh_run",
      evaluation: {
        run_id: "run-123",
        model: "gemini-3.5-flash",
        dataset_size: 2,
        adversarial_only: true,
        provenance: "live_backend_evaluated",
        precision: 1.0,
        recall: 0.5,
        f1_score: 0.6667,
        resolution_accuracy: 0.5,
        false_clarification_rate: 0.0,
        clarification_efficiency: 1.0,
        true_positives: 1,
        true_negatives: 0,
        false_positives: 0,
        false_negatives: 1,
        baseline_comparison: {
          name: "Naive Keyword Baseline",
          precision: 0.5,
          recall: 0.5,
          f1_score: 0.5,
          resolution_accuracy: 0.5,
          false_clarification_rate: 0.5,
          clarification_efficiency: 0,
          true_positives: 1,
          true_negatives: 0,
          false_positives: 1,
          false_negatives: 1,
        },
        results_detail: [
          {
            id: "adv-lex-001",
            instruction: "Apply the standard charge.",
            ambiguity_category: "lexical",
            expected_classification: "ambiguous",
            predicted_classification: "ambiguous",
            expected_needs_clarification: true,
            predicted_needs_clarification: true,
            expected_ambiguities: ["lexical"],
            detected_ambiguities: ["lexical"],
            correct_detections: ["lexical"],
            missed_ambiguities: [],
            false_positives: [],
            resolution_failed: false,
            turns_taken: 1,
            final_status: "NEEDS_CLARIFICATION",
            abstained: false,
            provenance: "live_backend",
            failure_explanation: null,
          },
          {
            id: "adv-sem-001",
            instruction: "Every planner checks a backup.",
            ambiguity_category: "semantic",
            expected_classification: "ambiguous",
            predicted_classification: "clear",
            expected_needs_clarification: true,
            predicted_needs_clarification: false,
            expected_ambiguities: ["semantic"],
            detected_ambiguities: [],
            correct_detections: [],
            missed_ambiguities: ["semantic"],
            false_positives: [],
            resolution_failed: true,
            turns_taken: 1,
            final_status: "RESOLVED",
            abstained: false,
            provenance: "live_backend",
            failure_explanation: "Missed expected semantic quantifier ambiguity.",
          },
        ],
      },
    };

    const history = mapBackendEvalToAdversarialHistory(payload);
    expect(history).not.toBeNull();
    expect(history?.provenance).toBe("live_backend_evaluated");
    expect(history?.resolveXMetrics.f1Score).toBe(0.6667);
    expect(history?.results[1]?.verdict).toBe("Failed");
    expect(history?.results[1]?.missedAmbiguities).toEqual(["semantic"]);
  });
});
