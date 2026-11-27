import { describe, expect, it } from "vitest";
import {
  generateDecisionTimeline,
  formatDecisionTimelineAsMarkdown,
} from "@/data/decisionTimelineEngine";
import {
  buildPresetAnalysis,
  computeClarificationOptimizerState,
  computeResolutionFromInputs,
  computeResolutionVerification,
} from "@/data/mockData";
import { createEmptySessionMemory, appendMessageToSessionMemory } from "@/data/contextMemoryEngine";
import { computeClientConfidenceAssessment } from "@/data/confidenceEngine";
import { evaluateClientIntentRisk } from "@/data/riskEngine";
import type { ClarificationAnswer } from "@/types/resolvex";

describe("Feature 10: Explainable AI Decision Timeline", () => {
  const analysis = buildPresetAnalysis("transfer_ambiguity");
  let testMemory = createEmptySessionMemory("sess-timeline-test");
  testMemory = appendMessageToSessionMemory(
    testMemory,
    "Transfer funds to John Smith in Finance and check Q3_Report.pdf tomorrow.",
    "user",
  );

  const initialAnswers: ClarificationAnswer[] = [];
  const initialOpt = computeClarificationOptimizerState(analysis, initialAnswers);
  const initialVerif = computeResolutionVerification(analysis, initialAnswers, null);
  const initialConf = computeClientConfidenceAssessment({
    analysis,
    clarificationAnswers: initialAnswers,
    selectedInterpretation: analysis.interpretations[0] ?? null,
    verificationReport: initialVerif,
    optimizerState: initialOpt,
  });
  const initialRisk = evaluateClientIntentRisk({
    prompt: analysis.prompt,
    action: "transfer_funds",
    target: "John",
    userConfirmed: false,
  });

  it("generates a chronological sequence of lifecycle events from raw prompt to final intent", () => {
    const timeline = generateDecisionTimeline({
      analysis,
      clarificationAnswers: initialAnswers,
      optimizerState: initialOpt,
      selectedInterpretation: analysis.interpretations[0] ?? null,
      confidenceAssessment: initialConf,
      riskAssessment: initialRisk,
      verificationReport: initialVerif,
      contextMemory: testMemory,
      userConfirmedHighRisk: false,
    });

    expect(timeline.events.length).toBeGreaterThanOrEqual(6);
    expect(timeline.totalEvents).toBe(timeline.events.length);
    expect(timeline.conversationId).toBe(analysis.id);

    // Initial input event
    const firstEvent = timeline.events[0];
    expect(firstEvent).toBeDefined();
    expect(firstEvent?.type).toBe("initial_input");
    expect(firstEvent?.summary).toContain(analysis.prompt);

    // Ambiguity event
    const ambEvent = timeline.events.find((e) => e.type === "ambiguity_detected");
    expect(ambEvent).toBeDefined();
    expect(ambEvent?.title).toContain("Ambiguity Detected");
    expect(ambEvent?.evidenceSignals.length).toBeGreaterThan(0);

    // Interpretation divergence event
    const interpEvent = timeline.events.find((e) => e.type === "interpretation_divergence");
    expect(interpEvent).toBeDefined();
    expect(interpEvent?.title).toContain("Candidate Interpretations");

    // Context memory coreference resolution event
    const memEvent = timeline.events.find((e) => e.type === "memory_coreference_resolved");
    expect(memEvent).toBeDefined();
    expect(memEvent?.summary).toContain("entity anchors");

    // Initial confidence event
    const confEvent = timeline.events.find((e) => e.type === "confidence_recalculated");
    expect(confEvent).toBeDefined();

    // Risk evaluated event
    const riskEvent = timeline.events.find((e) => e.type === "risk_assessment_evaluated");
    expect(riskEvent).toBeDefined();
    expect(riskEvent?.title).toContain("Risk");

    // Verification check event
    const verifEvent = timeline.events.find((e) => e.type === "verification_checked");
    expect(verifEvent).toBeDefined();
  });

  it("updates timeline with clarification answers and risk confirmation when user resolves ambiguities", () => {
    const answeredAnswers: ClarificationAnswer[] = [
      {
        questionId: "q1",
        selectedOptionId: "opt-1",
        customAnswer: "",
        resolvedValue: "John Smith (Finance Team)",
        answeredAt: new Date().toISOString(),
      },
    ];

    const answeredOpt = computeClarificationOptimizerState(analysis, answeredAnswers);
    const answeredRisk = evaluateClientIntentRisk({
      prompt: analysis.prompt,
      action: "transfer_funds",
      target: "John Smith (Finance Team)",
      userConfirmed: true,
    });
    const answeredVerif = computeResolutionVerification(
      analysis,
      answeredAnswers,
      analysis.interpretations[0] ?? null,
    );
    const answeredConf = computeClientConfidenceAssessment({
      analysis,
      clarificationAnswers: answeredAnswers,
      selectedInterpretation: analysis.interpretations[0] ?? null,
      verificationReport: answeredVerif,
      optimizerState: answeredOpt,
    });

    const mockFinalResolution = computeResolutionFromInputs(
      analysis.prompt,
      analysis.spans,
      analysis.interpretations[0] ?? null,
      answeredAnswers,
      analysis.domain,
      analysis.clarificationQuestions,
      testMemory,
    );

    const timeline = generateDecisionTimeline({
      analysis,
      clarificationAnswers: answeredAnswers,
      optimizerState: answeredOpt,
      selectedInterpretation: analysis.interpretations[0] ?? null,
      confidenceAssessment: answeredConf,
      riskAssessment: answeredRisk,
      verificationReport: answeredVerif,
      contextMemory: testMemory,
      finalResolution: mockFinalResolution,
      userConfirmedHighRisk: true,
    });

    const clarEvent = timeline.events.find((e) => e.type === "clarification_answered");
    expect(clarEvent).toBeDefined();
    expect(clarEvent?.summary).toContain("John Smith (Finance Team)");

    // Risk confirmed event
    const riskConfirmedEvent = timeline.events.find((e) => e.type === "risk_confirmed");
    expect(riskConfirmedEvent).toBeDefined();

    // Final compiled intent event
    const finalEvent = timeline.events.find((e) => e.type === "final_intent_compiled");
    expect(finalEvent).toBeDefined();
    expect(finalEvent?.title).toContain("Specification Compiled");
  });

  it("formats decision timeline cleanly into verifiable Markdown export without fabricating data", () => {
    const timeline = generateDecisionTimeline({
      analysis,
      clarificationAnswers: initialAnswers,
      optimizerState: initialOpt,
      selectedInterpretation: analysis.interpretations[0] ?? null,
      confidenceAssessment: initialConf,
      riskAssessment: initialRisk,
      verificationReport: initialVerif,
      contextMemory: testMemory,
      userConfirmedHighRisk: false,
    });

    const markdown = formatDecisionTimelineAsMarkdown(timeline);
    expect(markdown).toContain("# ResolveX Explainable AI Decision Timeline");
    expect(markdown).toContain(`**Conversation / Resolution ID**: \`${timeline.conversationId}\``);
    expect(markdown).toContain("### 1. Initial User Directive Received (`initial_input`)");
    expect(markdown).toContain("**Evidence Signals**:");
    expect(markdown).toContain("Zero external actions executed");
  });
});
