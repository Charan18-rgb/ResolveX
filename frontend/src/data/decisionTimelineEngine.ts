import type {
  AnalysisResult,
  ClarificationAnswer,
  ClarificationOptimizerState,
  ConfidenceAssessment,
  DecisionTimelineEvent,
  ExplainableDecisionTimeline,
  FinalResolution,
  IntentRiskAssessment,
  Interpretation,
  ResolutionVerificationReport,
  SessionContextMemory,
} from "@/types/resolvex";

export function generateDecisionTimeline(params: {
  analysis: AnalysisResult;
  clarificationAnswers: ClarificationAnswer[];
  optimizerState: ClarificationOptimizerState;
  selectedInterpretation: Interpretation | null;
  confidenceAssessment: ConfidenceAssessment;
  riskAssessment: IntentRiskAssessment;
  verificationReport: ResolutionVerificationReport;
  contextMemory?: SessionContextMemory | undefined;
  finalResolution?: FinalResolution | undefined;
  userConfirmedHighRisk?: boolean | undefined;
}): ExplainableDecisionTimeline {
  const {
    analysis,
    clarificationAnswers,
    optimizerState,
    selectedInterpretation,
    confidenceAssessment,
    riskAssessment,
    verificationReport,
    contextMemory,
    finalResolution,
    userConfirmedHighRisk,
  } = params;

  const events: DecisionTimelineEvent[] = [];
  const baseTime = new Date(analysis.createdAt || Date.now()).getTime();

  const timeOffset = (minutes: number) => new Date(baseTime + minutes * 60000).toISOString();

  // 1. Initial Prompt Received
  events.push({
    id: "evt-01-input",
    timestamp: timeOffset(0),
    turnNumber: 1,
    type: "initial_input",
    title: "Initial User Directive Received",
    summary: `Received input: "${analysis.prompt}" in ${analysis.domain} domain.`,
    explanation: `User provided initial natural-language prompt. Detected language: ${analysis.multilingual.detectedLanguage} (code-mixed: ${analysis.multilingual.isCodeMixed ? "Yes" : "No"}).`,
    sourceContext: `Domain: ${analysis.domain} | Strictness: ${analysis.strictness}`,
    sourceMessage: analysis.prompt,
    evidenceSignals: [
      `Length: ${analysis.prompt.length} chars`,
      `Language: ${analysis.multilingual.detectedLanguage}`,
      `Original Script: ${analysis.multilingual.originalPrompt}`,
    ],
    metricsSnapshot: {
      ambiguityScore: analysis.ambiguityScore,
      clarityScore: analysis.clarityScore,
      confidenceScore: confidenceAssessment.confidenceScore,
      riskLevel: analysis.riskLevel,
    },
  });

  // 2. Ambiguity Detection & Spans Identified
  if (analysis.spans.length > 0) {
    const topSpans = analysis.spans.slice(0, 3).map((s) => `“${s.token}” (${s.category})`);
    events.push({
      id: "evt-02-ambiguity",
      timestamp: timeOffset(1),
      turnNumber: 1,
      type: "ambiguity_detected",
      title: "Linguistic & Contextual Ambiguity Detected",
      summary: `Found ${analysis.spans.length} ambiguity span(s): ${topSpans.join(", ")}.`,
      explanation: `Identified lexical, referential, or scope indeterminacies yielding initial ambiguity score of ${analysis.ambiguityScore}%.`,
      sourceContext: `Category Breakdown: ${analysis.categoryBreakdown.map((c) => `${c.category} (${c.count})`).join(", ")}`,
      evidenceSignals: analysis.spans.slice(0, 4).map((s) => `"${s.token}": ${s.reason}`),
      metricsSnapshot: {
        ambiguityScore: analysis.ambiguityScore,
        clarityScore: analysis.clarityScore,
      },
    });
  }

  // 3. Candidate Interpretations & What-If Divergence
  if (analysis.interpretations.length > 0) {
    const activeInterp = selectedInterpretation ?? analysis.interpretations[0];
    events.push({
      id: "evt-03-interpretations",
      timestamp: timeOffset(2),
      turnNumber: 1,
      type: "interpretation_divergence",
      title: "Candidate Interpretations Synthesized",
      summary: `Formulated ${analysis.interpretations.length} divergent semantic interpretations.`,
      explanation: `Competing interpretations constructed from detected ambiguous triggers: ${analysis.interpretations
        .map((i) => `"${i.title}" (${i.probability}%)`)
        .join("; ")}.`,
      sourceContext: `Active Scenario: "${activeInterp?.title ?? "Default"}"`,
      evidenceSignals: (activeInterp?.assumptions ?? []).slice(0, 3),
      metricsSnapshot: {
        riskLevel: activeInterp?.riskLevel ?? analysis.riskLevel,
      },
    });
  }

  // 4. Session Context Memory Attributions
  if (contextMemory && contextMemory.entities.length > 0) {
    const resolvedTokens = contextMemory.resolvedReferences.map(
      (r) => `“${r.referenceToken}” → ${r.resolvedValue} (Turn ${r.sourceTurn ?? 1})`,
    );
    events.push({
      id: "evt-04-memory",
      timestamp: timeOffset(3),
      turnNumber: 1,
      type: "memory_coreference_resolved",
      title: "Session Context Memory & Coreference Binding",
      summary: `Tracked ${contextMemory.entities.length} entity anchors; resolved ${contextMemory.resolvedReferences.length} cross-turn reference(s).`,
      explanation:
        resolvedTokens.length > 0
          ? `Grounded ambiguous pronouns or ordinals from conversation history: ${resolvedTokens.join(", ")}.`
          : `Remembered ${contextMemory.entities.length} people/files/dates from prior session messages without cross-session leakage.`,
      sourceContext: `Session ID: ${contextMemory.sessionId}`,
      evidenceSignals: contextMemory.entities
        .slice(0, 4)
        .map((e) => `[${e.category}] ${e.value} (Turn ${e.sourceTurn})`),
    });
  }

  // 5. Initial Confidence & Uncertainty Calibration
  events.push({
    id: "evt-05-confidence",
    timestamp: timeOffset(4),
    turnNumber: 1,
    type: "confidence_recalculated",
    title: "Confidence & Uncertainty Intelligence Assessment",
    summary: confidenceAssessment.abstained
      ? `Engine abstained: ${confidenceAssessment.abstentionReason}`
      : `Initial confidence calibrated at ${Math.round((confidenceAssessment.confidenceScore ?? 0) * 100)}% (${confidenceAssessment.confidenceBand}).`,
    explanation: `Evaluated evidence sufficiency (${confidenceAssessment.evidenceSufficiencyScore}). Supporting signals: ${confidenceAssessment.supportingEvidence.length}, Contradicting: ${confidenceAssessment.contradictingEvidence.length}. Provenance: ${confidenceAssessment.isLiveBackend ? "Live FastAPI Backend" : "Client Simulation (Not Model Output)"}.`,
    sourceContext: `Recommended Action: ${confidenceAssessment.recommendedAction.replace("_", " ")}`,
    evidenceSignals: [
      ...confidenceAssessment.supportingEvidence.slice(0, 2).map((e) => `[Supporting] ${e.label}`),
      ...confidenceAssessment.contradictingEvidence
        .slice(0, 2)
        .map((e) => `[Contradicting] ${e.label}`),
    ],
    metricsSnapshot: {
      confidenceScore: confidenceAssessment.confidenceScore,
      verifiedCorrectness: confidenceAssessment.verifiedCorrectness,
    },
  });

  // 6. Clarification Turns & User Answers
  clarificationAnswers.forEach((answer, idx) => {
    const question = analysis.clarificationQuestions.find((q) => q.id === answer.questionId);
    events.push({
      id: `evt-06-clarify-${idx + 1}`,
      timestamp: answer.answeredAt ?? timeOffset(5 + idx * 2),
      turnNumber: answer.turnNumber ?? idx + 1,
      type: "clarification_answered",
      title: `Clarification Turn #${idx + 1}: “${answer.targetToken ?? question?.targetToken ?? "Parameter"}” Clarified`,
      summary: `User resolved “${answer.targetToken ?? question?.targetToken ?? "Target"}” to “${answer.resolvedValue}”.`,
      explanation: `Question: "${question?.question ?? answer.questionText ?? "Clarification request"}". User answered: "${answer.resolvedValue}". Reduced ambiguity by ${answer.ambiguityReduction ?? question?.estimatedClarityGain ?? 20} pts.`,
      sourceContext: `Essential Field: ${answer.essentialField ?? question?.essentialField ?? "Target Entity"}`,
      sourceMessage: answer.customAnswer || answer.resolvedValue,
      targetToken: answer.targetToken ?? question?.targetToken,
      evidenceSignals: [
        `Source: ${answer.source === "custom" ? "Custom User Input" : "Predefined Clarification Option"}`,
        `Selection Rationale: ${answer.selectionExplanation ?? question?.selectionExplanation ?? "Prioritized by impact score"}`,
      ],
      metricsSnapshot: {
        ambiguityScore: Math.max(5, analysis.ambiguityScore - (idx + 1) * 22),
        clarityScore: Math.min(95, analysis.clarityScore + (idx + 1) * 25),
      },
    });
  });

  // 7. Risk-Aware Guardrails Check
  events.push({
    id: "evt-07-risk",
    timestamp: timeOffset(5 + clarificationAnswers.length * 2 + 1),
    turnNumber: Math.max(1, clarificationAnswers.length),
    type: userConfirmedHighRisk ? "risk_confirmed" : "risk_assessment_evaluated",
    title: `Risk-Aware Guardrail Check (${riskAssessment.riskLevel} Risk)`,
    summary: `Assessed risk score ${riskAssessment.riskScore}/100. Reversibility: ${riskAssessment.reversibility}. Safe to conclude: ${riskAssessment.safeToResolve ? "Yes" : "Gated"}.`,
    explanation: riskAssessment.requiresExplicitConfirmation
      ? `High-consequence operations detected. ${riskAssessment.confirmationReason ?? "Explicit human confirmation required"}. ${userConfirmedHighRisk ? "User explicitly confirmed intent." : "Awaiting explicit user confirmation."}`
      : "Low/moderate consequence operation within standard safety tolerances. No explicit confirmation gate required.",
    sourceContext: `Mitigation: ${riskAssessment.mitigationGuidance}`,
    evidenceSignals: riskAssessment.riskFactors.map(
      (f) => `[${f.level}] ${f.label}: ${f.description}`,
    ),
    metricsSnapshot: {
      riskLevel: riskAssessment.riskLevel,
    },
  });

  // 8. Resolution Verification Layer
  events.push({
    id: "evt-08-verification",
    timestamp: timeOffset(5 + clarificationAnswers.length * 2 + 2),
    turnNumber: Math.max(1, clarificationAnswers.length),
    type: "verification_checked",
    title: `Resolution Readiness Verification (${verificationReport.completenessScore}%)`,
    summary: `Verification Status: ${verificationReport.status}. ${verificationReport.requiredPassed}/${verificationReport.requiredTotal} required fields passed.`,
    explanation: verificationReport.completenessExplanation,
    sourceContext: `Checked ${verificationReport.fieldChecks.length} field specifications at ${verificationReport.checkedAt}`,
    evidenceSignals: verificationReport.fieldChecks.map(
      (c) => `${c.field} (${c.required ? "Required" : "Optional"}): ${c.status} — ${c.explanation}`,
    ),
    metricsSnapshot: {
      verificationStatus: verificationReport.status,
    },
  });

  // 9. Final Resolved Intent Compiled
  if (finalResolution) {
    events.push({
      id: "evt-09-final",
      timestamp: finalResolution.generatedAt || timeOffset(5 + clarificationAnswers.length * 2 + 3),
      turnNumber: Math.max(1, clarificationAnswers.length),
      type: "final_intent_compiled",
      title: "Deterministic Structured Intent Specification Compiled",
      summary: `Compiled unambiguous intent: "${finalResolution.resolvedPrompt.slice(0, 100)}…".`,
      explanation: `Resolved prompt compiled with ${finalResolution.appliedDecisions.length} confirmed decisions. Clarity Gain: +${finalResolution.clarityGain} pts. Remaining ambiguity: ${finalResolution.remainingAmbiguityScore}%. Ready for downstream execution (ResolveX executes zero external actions).`,
      sourceContext: `Structured Intent Type: ${finalResolution.structuredSpec.intentType} | Time Horizon: ${finalResolution.structuredSpec.timeHorizon}`,
      sourceMessage: finalResolution.resolvedPrompt,
      evidenceSignals: finalResolution.appliedDecisions.map(
        (d) => `${d.token} → ${d.decision} (${d.essentialField ?? "Scope"})`,
      ),
      metricsSnapshot: {
        ambiguityScore: finalResolution.remainingAmbiguityScore,
        clarityScore: 100 - finalResolution.remainingAmbiguityScore,
      },
    });
  }

  const summaryNarrative = `Processed directive "${analysis.prompt.slice(0, 48)}…" across ${events.length} observable lifecycle decisions: Initial ambiguity (${analysis.ambiguityScore}%) was analyzed, ${clarificationAnswers.length} clarification turn(s) were answered, context memory was attributed without cross-session leakage, risk was evaluated (${riskAssessment.riskLevel}), and intent was verified (${verificationReport.status}) into a deterministic contract.`;

  return {
    conversationId: analysis.id,
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,
    events,
    summaryNarrative,
  };
}

export function formatDecisionTimelineAsMarkdown(timeline: ExplainableDecisionTimeline): string {
  const lines: string[] = [
    `# ResolveX Explainable AI Decision Timeline`,
    `**Conversation / Resolution ID**: \`${timeline.conversationId}\``,
    `**Generated At**: ${timeline.generatedAt}`,
    `**Total Observable Events**: ${timeline.totalEvents}`,
    ``,
    `## Executive Narrative`,
    timeline.summaryNarrative,
    ``,
    `---`,
    `## Chronological Decision History`,
    ``,
  ];

  timeline.events.forEach((evt, idx) => {
    lines.push(`### ${idx + 1}. ${evt.title} (\`${evt.type}\`)`);
    lines.push(`- **Turn**: #${evt.turnNumber} | **Timestamp**: \`${evt.timestamp}\``);
    lines.push(`- **Summary**: ${evt.summary}`);
    lines.push(`- **Why Decision Was Made**: ${evt.explanation}`);
    if (evt.sourceContext) {
      lines.push(`- **Source Context**: ${evt.sourceContext}`);
    }
    if (evt.sourceMessage) {
      lines.push(`- **Linked Message**: "${evt.sourceMessage}"`);
    }
    if (evt.evidenceSignals && evt.evidenceSignals.length > 0) {
      lines.push(`- **Evidence Signals**:`);
      evt.evidenceSignals.forEach((sig) => lines.push(`  - ${sig}`));
    }
    lines.push(``);
  });

  lines.push(`---`);
  lines.push(
    `*Generated deterministically by ResolveX Feature 10 Explainability Layer. Zero external actions executed.*`,
  );

  return lines.join("\n");
}
