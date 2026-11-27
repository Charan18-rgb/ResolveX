import { describe, expect, it } from "vitest";
import {
  computeClientConfidenceAssessment,
  enrichInterpretationsWithConfidence,
  mapBackendAnalyzeToAnalysisResult,
} from "@/data/confidenceEngine";
import {
  analyzeCustomPromptMock,
  buildPresetAnalysis,
  computeClarificationOptimizerState,
  computeResolutionVerification,
} from "@/data/mockData";
import type { BackendAnalyzeResponse, ClarificationAnswer } from "@/types/resolvex";

describe("Feature 6: Confidence & Uncertainty Intelligence Engine (Frontend)", () => {
  it("abstains on insufficient vague input instead of guessing", () => {
    const analysis = buildPresetAnalysis("ex-insufficient-evidence");
    const optimizer = computeClarificationOptimizerState(analysis, [], 60, false, null);
    const verification = computeResolutionVerification(analysis, [], null);

    const assessment = computeClientConfidenceAssessment({
      analysis,
      clarificationAnswers: [],
      selectedInterpretation: analysis.interpretations[0] ?? null,
      verificationReport: verification,
      optimizerState: optimizer,
    });

    expect(assessment.provenance).toBe("client_simulation");
    expect(assessment.isLiveBackend).toBe(false);
    expect(assessment.abstained).toBe(true);
    expect(assessment.confidenceScore).toBeNull();
    expect(assessment.confidenceBand).toBe("abstained");
    expect(assessment.verifiedCorrectness).toBe("unverified");
    expect(assessment.recommendedAction).toBe("request_clarification");

    const enriched = enrichInterpretationsWithConfidence(analysis.interpretations, assessment, []);
    expect(
      enriched.every((i) => i.confidenceStatus === "abstained" && i.confidenceScore === null),
    ).toBe(true);
  });

  it("detects contradictory directives and marks correctness as contradictory", () => {
    const analysis = buildPresetAnalysis("ex-contradictory-ops");
    const optimizer = computeClarificationOptimizerState(analysis, [], 60, false, null);
    const verification = computeResolutionVerification(analysis, [], null);

    const assessment = computeClientConfidenceAssessment({
      analysis,
      clarificationAnswers: [],
      selectedInterpretation: analysis.interpretations[0] ?? null,
      verificationReport: verification,
      optimizerState: optimizer,
    });

    expect(assessment.abstained).toBe(true);
    expect(assessment.verifiedCorrectness).toBe("contradictory");
    expect(assessment.recommendedAction).toBe("resolve_conflicts");
    expect(assessment.contradictingEvidence.length).toBeGreaterThanOrEqual(2);
    expect(assessment.history[0]?.abstained).toBe(true);
  });

  it("updates confidence and explains changes across clarification turns", () => {
    const analysis = buildPresetAnalysis("ex-deploy-fast");
    const initialOpt = computeClarificationOptimizerState(analysis, [], 60, false, null);
    const initialVer = computeResolutionVerification(analysis, [], null);
    const initialConf = computeClientConfidenceAssessment({
      analysis,
      clarificationAnswers: [],
      selectedInterpretation: analysis.interpretations[0] ?? null,
      verificationReport: initialVer,
      optimizerState: initialOpt,
    });

    expect(initialConf.abstained).toBe(false);
    expect(initialConf.verifiedCorrectness).toBe("unverified");

    const answers: ClarificationAnswer[] = analysis.clarificationQuestions
      .filter((q) => q.isEssential)
      .map((q, idx) => ({
        questionId: q.id,
        selectedOptionId: q.options[0]?.id ?? null,
        customAnswer: "",
        resolvedValue: q.options[0]?.resolvesTo ?? "Verified selection constraint",
        turnNumber: idx + 1,
        targetToken: q.targetToken,
        essentialField: q.essentialField,
        clarityBefore: 35 + idx * 18,
        clarityAfter: 55 + idx * 15,
        source: "option",
      }));

    const afterOpt = computeClarificationOptimizerState(analysis, answers, 60, false, null);
    const afterVer = computeResolutionVerification(analysis, answers, null);
    const afterConf = computeClientConfidenceAssessment({
      analysis,
      clarificationAnswers: answers,
      selectedInterpretation: analysis.interpretations[0] ?? null,
      verificationReport: afterVer,
      optimizerState: afterOpt,
    });

    expect(afterConf.abstained).toBe(false);
    expect(afterConf.verifiedCorrectness).toBe("verified");
    expect(afterConf.recommendedAction).toBe("proceed_verified");
    expect(afterConf.confidenceScore ?? 0).toBeGreaterThan(initialConf.confidenceScore ?? 0);
    expect(afterConf.history.length).toBe(1 + answers.length);
    expect(afterConf.history.at(-1)?.changeSummary.length).toBeGreaterThan(10);
  });

  it("maps live backend ConfidenceAssessment cleanly without fabricating missing scores", () => {
    const backendPayload: BackendAnalyzeResponse = {
      conversation_id: "conv-live-1",
      status: "NEEDS_CLARIFICATION",
      classification: "ambiguous",
      ambiguity_types: ["referential"],
      needs_clarification: true,
      interpretations: [
        {
          label: "Option A",
          description: "Interpretation A",
          confidence_score: null,
          confidence_status: "abstained",
          supporting_signals: [],
          contradicting_signals: ["Backend AI unavailable"],
          missing_requirements: ["Recipient"],
        },
      ],
      missing_required_info: ["Recipient"],
      clarification_questions: ["Who is the recipient?"],
      resolved_intent: null,
      inventory_insight: null,
      turn_count: 1,
      confidence_assessment: {
        provenance: "ai_unavailable_abstained",
        model_confidence_available: false,
        confidence_basis: "insufficient_evidence_abstained",
        confidence_score: null,
        confidence_band: "abstained",
        uncertainty_score: 1.0,
        evidence_sufficiency_score: 0.0,
        verified_correctness: "unverified",
        verification_explanation: "Fallback mode active; refusing to fabricate confidence.",
        abstained: true,
        abstention_reason: "Model unavailable.",
        supporting_evidence: [],
        contradicting_evidence: [
          {
            id: "c1",
            polarity: "contradicting",
            category: "AI Provenance Guard",
            label: "Fallback active",
            detail: "GEMINI_API_KEY missing",
            source: "fallback_guard",
            impact_weight: 0.5,
          },
        ],
        missing_context: ["Recipient"],
        unresolved_entities: [],
        calibration_note: "Real backend output",
      },
      confidence_history: [
        {
          turn_number: 1,
          timestamp: "2026-11-27T12:00:00Z",
          event_label: "Initial Prompt Analysis",
          trigger_input: "Send it soon",
          confidence_score: null,
          confidence_band: "abstained",
          verified_correctness: "unverified",
          abstained: true,
          delta_from_previous: null,
          change_reasons: ["Model unavailable"],
          change_summary: "Abstained on Turn 1.",
          evidence_count_supporting: 0,
          evidence_count_contradicting: 1,
        },
      ],
    };

    const mapped = mapBackendAnalyzeToAnalysisResult(
      backendPayload,
      "Send it soon",
      "General",
      "Balanced",
    );

    expect(mapped.isDemoData).toBe(false);
    expect(mapped.confidenceAssessment?.provenance).toBe("ai_unavailable_abstained");
    expect(mapped.confidenceAssessment?.abstained).toBe(true);
    expect(mapped.confidenceAssessment?.confidenceScore).toBeNull();
    expect(mapped.interpretations[0]?.confidenceStatus).toBe("abstained");
    expect(mapped.confidenceAssessment?.history).toHaveLength(1);
  });

  it("keeps custom prompt analyzer working for vague prompts", () => {
    const custom = analyzeCustomPromptMock("Do it soon", "General", "Balanced", 3, "Auto Detect");
    expect(custom.spans.length).toBeGreaterThanOrEqual(2);
  });
});
