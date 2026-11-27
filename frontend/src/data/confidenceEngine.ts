import type {
  AnalysisResult,
  BackendAnalyzeResponse,
  BackendConfidenceAssessmentDTO,
  BackendConfidenceHistoryDTO,
  ClarificationAnswer,
  ClarificationOptimizerState,
  ConfidenceAssessment,
  ConfidenceBand,
  ConfidenceHistoryPoint,
  DomainContext,
  EvidenceItem,
  Interpretation,
  ResolutionVerificationReport,
  StrictnessLevel,
  UnresolvedEntityItem,
  VerifiedCorrectnessState,
} from "@/types/resolvex";
import { detectLanguageMetadata } from "./multilingualEngine";
import { mapBackendContextMemory } from "./contextMemoryEngine";

const CONCRETE_ANCHOR_PATTERNS = [
  /\bMAT-[A-Z0-9-]+\b/gi,
  /\bORD-[0-9]+\b/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\bQ[1-4](?:\s+20\d{2})?\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d+\s*(?:hours?|days?|minutes?|units?|pcs|km|miles|%|h|d)\b/gi,
];

const INLINE_CONTRADICTION_PAIRS: Array<{
  a: string[];
  b: string[];
  label: string;
  detail: string;
}> = [
  {
    a: ["staging only", "only staging", "never prod"],
    b: ["production", "prod rollout", "live users"],
    label: "Staging-only vs. Production rollout",
    detail:
      "Input mixes a staging-only safety restriction with a live production deployment directive.",
  },
  {
    a: ["immediately", "right now", "today"],
    b: ["next week", "next month", "defer", "cancel", "hold"],
    label: "Immediate vs. Deferred/Cancelled schedule",
    detail: "Conflicting execution timelines prevent selecting a safe release schedule.",
  },
  {
    a: ["suspend", "revoke", "delete", "disable"],
    b: ["keep active", "preserve", "enable", "keep sessions", "allow access"],
    label: "Restrictive action vs. Preservation guarantee",
    detail: "Directive requests incompatible access/state transitions simultaneously.",
  },
  {
    a: ["read-only", "read only", "view only"],
    b: ["write access", "admin", "modify"],
    label: "Read-only constraint vs. Write permission",
    detail: "Security posture conflicts with requested write mutation capability.",
  },
];

const INDECISION_REGEX =
  /\b(neither|none of|not sure|don't know|dont know|whatever|skip|maybe both)\b/i;

function bandFromScore(score: number | null, abstained: boolean): ConfidenceBand {
  if (abstained || score === null) return "abstained";
  if (score >= 0.78) return "high";
  if (score >= 0.5) return "moderate";
  return "low";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapHistoryDTO(dto: BackendConfidenceHistoryDTO): ConfidenceHistoryPoint {
  return {
    turnNumber: dto.turn_number,
    timestamp: dto.timestamp,
    eventLabel: dto.event_label,
    triggerInput: dto.trigger_input,
    confidenceScore: dto.confidence_score,
    confidenceBand: dto.confidence_band,
    verifiedCorrectness: dto.verified_correctness,
    abstained: dto.abstained,
    deltaFromPrevious: dto.delta_from_previous,
    changeReasons: dto.change_reasons,
    changeSummary: dto.change_summary,
    evidenceCountSupporting: dto.evidence_count_supporting,
    evidenceCountContradicting: dto.evidence_count_contradicting,
  };
}

export function mapBackendConfidenceAssessment(
  dto: BackendConfidenceAssessmentDTO | null | undefined,
  historyDto: BackendConfidenceHistoryDTO[] | undefined,
): ConfidenceAssessment | undefined {
  if (!dto) return undefined;
  return {
    provenance: dto.provenance,
    isLiveBackend: true,
    modelConfidenceAvailable: dto.model_confidence_available,
    confidenceBasis: dto.confidence_basis,
    confidenceScore: dto.confidence_score,
    confidenceBand: dto.confidence_band,
    uncertaintyScore: dto.uncertainty_score,
    evidenceSufficiencyScore: dto.evidence_sufficiency_score,
    verifiedCorrectness: dto.verified_correctness,
    verificationExplanation: dto.verification_explanation,
    abstained: dto.abstained,
    abstentionReason: dto.abstention_reason,
    recommendedAction:
      dto.recommended_action ??
      (dto.abstained || dto.verified_correctness !== "verified"
        ? "request_clarification"
        : "proceed_verified"),
    recommendationReason:
      dto.recommendation_reason ??
      (dto.abstained || dto.verified_correctness !== "verified"
        ? "Evidence is incomplete or uncertain; request targeted clarification instead of forcing an uncertain interpretation."
        : "Verified backend intent checks passed."),
    supportingEvidence: dto.supporting_evidence.map((ev) => ({
      id: ev.id,
      polarity: ev.polarity,
      category: ev.category,
      label: ev.label,
      detail: ev.detail,
      source: ev.source,
      impactWeight: ev.impact_weight,
    })),
    contradictingEvidence: dto.contradicting_evidence.map((ev) => ({
      id: ev.id,
      polarity: ev.polarity,
      category: ev.category,
      label: ev.label,
      detail: ev.detail,
      source: ev.source,
      impactWeight: ev.impact_weight,
    })),
    missingContext: dto.missing_context,
    unresolvedEntities: dto.unresolved_entities.map((ent) => ({
      token: ent.token,
      kind: ent.kind,
      reason: ent.reason,
      resolved: ent.resolved,
      resolvedValue: ent.resolved_value ?? undefined,
    })),
    history: (historyDto ?? []).map(mapHistoryDTO),
    calibrationNote: dto.calibration_note,
  };
}

export function mapBackendAnalyzeToAnalysisResult(
  backend: BackendAnalyzeResponse,
  originalPrompt: string,
  domain: DomainContext,
  strictness: StrictnessLevel,
  previousAnalysis?: AnalysisResult,
): AnalysisResult {
  const confidenceAssessment = mapBackendConfidenceAssessment(
    backend.confidence_assessment,
    backend.confidence_history,
  );
  const overallScorePct =
    confidenceAssessment?.confidenceScore != null
      ? Math.round(confidenceAssessment.confidenceScore * 100)
      : (previousAnalysis?.clarityScore ?? 20);
  const ambiguityScore = confidenceAssessment
    ? Math.round(confidenceAssessment.uncertaintyScore * 100)
    : (previousAnalysis?.ambiguityScore ?? (backend.needs_clarification ? 78 : 14));
  const clarityScore = Math.max(0, 100 - ambiguityScore);

  const mappedInterpretations: Interpretation[] =
    backend.interpretations.length > 0
      ? backend.interpretations.map((item, idx) => {
          const calibratedPct =
            item.confidence_score != null ? Math.round(item.confidence_score * 100) : 0;
          return {
            id: `backend-interp-${idx + 1}`,
            title: item.label,
            summary: item.description,
            probability: calibratedPct,
            impactScope: domain,
            riskLevel:
              item.confidence_status === "abstained" ||
              (item.contradicting_signals?.length ?? 0) > 0
                ? "High"
                : calibratedPct >= 70
                  ? "Low"
                  : "Moderate",
            assumptions: item.supporting_signals ?? [],
            recommendedAction: backend.resolved_intent?.resolved_instruction ?? item.description,
            simulatedIntent: {
              action: backend.resolved_intent?.action ?? item.label,
              entities:
                Object.keys(backend.resolved_intent?.parameters ?? {}).length > 0
                  ? Object.entries(backend.resolved_intent?.parameters ?? {}).map(
                      ([k, v]) => `${k}: ${String(v)}`,
                    )
                  : backend.ambiguity_types,
              recipient: String(
                backend.resolved_intent?.parameters["recipient"] ?? "Pending confirmation",
              ),
              object: item.label,
              date: String(
                backend.resolved_intent?.parameters["deadline"] ?? "Pending confirmation",
              ),
              resolvedDirective: backend.resolved_intent?.resolved_instruction ?? item.description,
            },
            triggerWords: backend.ambiguity_types.map((t) => ({
              word: t,
              category: "Contextual" as const as "Lexical",
              divergenceReason: `Flagged as ${t} ambiguity by backend classifier.`,
            })),
            consequences: [
              {
                label:
                  item.confidence_status === "abstained"
                    ? "Abstained (No Auto-Execution)"
                    : "Backend Candidate Reading",
                severity: item.confidence_status === "abstained" ? "Risk" : "Neutral",
                detail: item.description,
              },
            ],
            confidenceScore: item.confidence_score ?? null,
            confidenceStatus: item.confidence_status ?? "calibrated",
            supportingSignals: item.supporting_signals ?? [],
            contradictingSignals: item.contradicting_signals ?? [],
            missingRequirements: item.missing_requirements ?? [],
          };
        })
      : (previousAnalysis?.interpretations ?? []);

  const questionList: AnalysisResult["clarificationQuestions"] =
    backend.clarification_questions.map((qText, idx) => {
      const targetMissing = backend.missing_required_info[idx] ?? `Context Slot ${idx + 1}`;
      return {
        id: `backend-cq-${backend.turn_count}-${idx + 1}`,
        targetSpanId: `backend-span-${idx + 1}`,
        targetToken: targetMissing,
        category: "Scope",
        question: qText,
        rationale: "Generated by live FastAPI backend ambiguity engine.",
        importanceScore: Math.max(70, 95 - idx * 10),
        essentialField:
          idx === 0 ? "Target Entity" : idx === 1 ? "Action Scope" : "Execution Timing",
        isEssential: true,
        estimatedClarityGain: 28,
        necessityReason: "Required by backend NLU to resolve ambiguity or missing required info.",
        selectionExplanation: `Turn ${backend.turn_count} question prioritized from backend analysis.`,
        options: [],
      };
    });

  const resolvedText =
    backend.resolved_intent?.resolved_instruction ??
    backend.resolved_intent?.direct_answer ??
    (confidenceAssessment?.abstained
      ? `Abstained: ${confidenceAssessment.abstentionReason ?? "Insufficient evidence to compile final intent."}`
      : originalPrompt);

  return {
    id: backend.conversation_id,
    prompt: originalPrompt,
    domain,
    strictness,
    createdAt: new Date().toISOString(),
    isDemoData: false,
    ambiguityScore,
    clarityScore: overallScorePct || clarityScore,
    riskLevel: confidenceAssessment?.abstained
      ? "Critical"
      : ambiguityScore >= 70
        ? "High"
        : ambiguityScore >= 40
          ? "Moderate"
          : "Low",
    summary:
      confidenceAssessment?.abstentionReason ??
      (backend.resolved_intent
        ? `Backend status: ${backend.status} (${backend.classification ?? "analyzed"}).`
        : `Backend detected ${backend.ambiguity_types.join(", ") || "ambiguity"} requiring clarification.`),
    multilingual: detectLanguageMetadata(originalPrompt, "Auto Detect"),
    spans: previousAnalysis?.spans ?? [],
    categoryBreakdown: previousAnalysis?.categoryBreakdown ?? [],
    interpretations: mappedInterpretations,
    clarificationQuestions:
      questionList.length > 0 ? questionList : (previousAnalysis?.clarificationQuestions ?? []),
    defaultResolution: {
      originalPrompt,
      resolvedPrompt: resolvedText,
      clarityGain: Math.max(0, clarityScore - (previousAnalysis?.clarityScore ?? 20)),
      remainingAmbiguityScore: ambiguityScore,
      structuredSpec: {
        intentType:
          backend.resolved_intent?.action ?? backend.classification ?? "pending_clarification",
        primarySubject: originalPrompt,
        targetScope: domain,
        constraints: Object.entries(backend.resolved_intent?.parameters ?? {}).map(
          ([k, v]) => `${k}: ${String(v)}`,
        ),
        timeHorizon: String(backend.resolved_intent?.parameters["deadline"] ?? "Unspecified"),
        outputFormat: "JSON + Natural Language Contract",
        confidenceAfterClarification: clarityScore,
      },
      appliedDecisions: [],
      generatedAt: new Date().toISOString(),
    },
    backendConversationId: backend.conversation_id,
    backendStatus: backend.status,
    confidenceAssessment,
    backendInventoryInsight: backend.inventory_insight ?? null,
    contextMemory: mapBackendContextMemory(backend.context_memory),
    riskAssessment: backend.risk_assessment
      ? {
          riskLevel: backend.risk_assessment.risk_level,
          riskScore: backend.risk_assessment.risk_score,
          requiresExplicitConfirmation: backend.risk_assessment.requires_explicit_confirmation,
          confirmationReason: backend.risk_assessment.confirmation_reason,
          highImpactAmbiguities: backend.risk_assessment.high_impact_ambiguities,
          riskFactors: backend.risk_assessment.risk_factors.map((f) => ({
            dimension: f.dimension,
            level: f.level,
            label: f.label,
            description: f.description,
            targetToken: f.target_token ?? undefined,
            requiresConfirmation: f.requires_confirmation ?? false,
          })),
          actionType: backend.risk_assessment.action_type,
          targetSummary: backend.risk_assessment.target_summary,
          reversibility: backend.risk_assessment.reversibility,
          mitigationGuidance: backend.risk_assessment.mitigation_guidance,
          safeToResolve: backend.risk_assessment.safe_to_resolve,
        }
      : undefined,
  };
}

export function computeClientConfidenceAssessment({
  analysis,
  clarificationAnswers,
  selectedInterpretation,
  verificationReport,
  optimizerState,
}: {
  analysis: AnalysisResult;
  clarificationAnswers: ClarificationAnswer[];
  selectedInterpretation: Interpretation | null;
  verificationReport: ResolutionVerificationReport;
  optimizerState: ClarificationOptimizerState;
}): ConfidenceAssessment {
  // Preserve live backend assessment whenever backend has already synced through current clarification turns
  if (
    analysis.confidenceAssessment &&
    analysis.confidenceAssessment.isLiveBackend &&
    analysis.confidenceAssessment.history.length >= clarificationAnswers.length + 1
  ) {
    return analysis.confidenceAssessment;
  }

  const validAnswers = clarificationAnswers.filter((a) => a.resolvedValue.trim().length > 0);
  const answerByQuestionId = new Map(validAnswers.map((a) => [a.questionId, a]));

  const supportingEvidence: EvidenceItem[] = [];
  const contradictingEvidence: EvidenceItem[] = [];

  // 1. Anchors in original prompt
  const anchors: string[] = [];
  for (const pat of CONCRETE_ANCHOR_PATTERNS) {
    const matches = analysis.prompt.match(pat);
    if (matches) anchors.push(...matches);
  }
  const uniqueAnchors = [...new Set(anchors)];
  if (uniqueAnchors.length > 0) {
    supportingEvidence.push({
      id: "cli-sup-anchors",
      polarity: "supporting",
      category: "Explicit Anchors",
      label: `Concrete references detected (${uniqueAnchors.slice(0, 4).join(", ")})`,
      detail: "Explicit IDs, quantities, dates, or targets narrow possible interpretations.",
      source: "client_simulation",
      impactWeight: Math.min(0.24, uniqueAnchors.length * 0.08),
    });
  }

  if (analysis.domain && analysis.domain !== "General") {
    supportingEvidence.push({
      id: "cli-sup-domain",
      polarity: "supporting",
      category: "Domain Scoping",
      label: `Scoped to ${analysis.domain} context`,
      detail: `Candidate interpretations bounded within ${analysis.domain} safety rules.`,
      source: "client_simulation",
      impactWeight: 0.12,
    });
  }

  if (validAnswers.length > 0) {
    supportingEvidence.push({
      id: "cli-sup-turns",
      polarity: "supporting",
      category: "Clarification Turns",
      label: `${validAnswers.length} clarification constraint(s) confirmed`,
      detail: `Latest resolved constraint: “${validAnswers[validAnswers.length - 1]?.resolvedValue ?? ""}”`,
      source: "clarification_turn",
      impactWeight: Math.min(0.36, validAnswers.length * 0.16),
    });
  }

  if (verificationReport.allRequiredPassed) {
    supportingEvidence.push({
      id: "cli-sup-verified",
      polarity: "supporting",
      category: "Verification Gate",
      label: `All ${verificationReport.requiredTotal} required checks passed`,
      detail: verificationReport.completenessExplanation,
      source: "verification_layer",
      impactWeight: 0.24,
    });
  }

  // Session Context Memory supporting references & conflicting references
  if (analysis.contextMemory) {
    for (const ref of analysis.contextMemory.resolvedReferences) {
      supportingEvidence.push({
        id: `cli-sup-mem-${ref.referenceToken}`,
        polarity: "supporting",
        category: "Session Memory Coreference",
        label: `Resolved “${ref.referenceToken}” → ${ref.resolvedValue ?? ""}`,
        detail: ref.explanation,
        source: "session_memory",
        impactWeight: 0.18,
      });
    }
    for (const conflict of analysis.contextMemory.referenceConflicts) {
      contradictingEvidence.push({
        id: `cli-con-mem-${conflict.referenceToken}`,
        polarity: "contradicting",
        category: conflict.status === "conflicting" ? "Directive Conflict" : "Unresolved Selection",
        label: `Session reference ${conflict.status}: “${conflict.referenceToken}”`,
        detail: conflict.explanation,
        source: "session_memory",
        impactWeight: conflict.status === "conflicting" ? 0.34 : 0.22,
      });
    }
  }

  // 2. Contradictions from verification layer + inline prompt pairs + indecisive answers
  verificationReport.contradictions.forEach((c, idx) => {
    contradictingEvidence.push({
      id: `cli-con-ver-${idx}`,
      polarity: "contradicting",
      category: "Verification Contradiction",
      label: `${c.fields[0]} ↔ ${c.fields[1]} conflict`,
      detail: c.reason,
      source: "verification_layer",
      impactWeight: 0.36,
    });
  });

  const combinedText =
    `${analysis.prompt} ${validAnswers.map((a) => a.resolvedValue).join(" ")}`.toLowerCase();
  INLINE_CONTRADICTION_PAIRS.forEach((pair, idx) => {
    const hitA = pair.a.find((t) => combinedText.includes(t));
    const hitB = pair.b.find((t) => combinedText.includes(t));
    if (hitA && hitB) {
      contradictingEvidence.push({
        id: `cli-con-inline-${idx}`,
        polarity: "contradicting",
        category: "Directive Conflict",
        label: `${pair.label} (“${hitA}” vs “${hitB}”)`,
        detail: pair.detail,
        source: "contradiction_detector",
        impactWeight: 0.34,
      });
    }
  });

  for (const ans of validAnswers) {
    if (INDECISION_REGEX.test(ans.resolvedValue)) {
      contradictingEvidence.push({
        id: `cli-con-indec-${ans.questionId}`,
        polarity: "contradicting",
        category: "Unresolved Selection",
        label: `Non-committal answer on “${ans.targetToken ?? ans.questionId}”`,
        detail: `User answered “${ans.resolvedValue}”, refusing to narrow ambiguity.`,
        source: "clarification_turn",
        impactWeight: 0.28,
      });
    }
  }

  if (
    analysis.interpretations.length >= 2 &&
    validAnswers.length === 0 &&
    analysis.ambiguityScore >= 65
  ) {
    contradictingEvidence.push({
      id: "cli-con-competing",
      polarity: "contradicting",
      category: "Competing Hypotheses",
      label: `${analysis.interpretations.length} competing interpretations lack confirmation`,
      detail: `Initial ambiguity index (${analysis.ambiguityScore}%) leaves divergent execution paths open.`,
      source: "client_simulation",
      impactWeight: 0.18,
    });
  }

  // 3. Unresolved entities & missing context
  const unresolvedEntities: UnresolvedEntityItem[] = analysis.spans.map((span) => {
    const linkedQ = analysis.clarificationQuestions.find(
      (q) =>
        q.targetSpanId === span.id ||
        q.dependentSpanIds?.includes(span.id) ||
        q.targetToken.toLowerCase() === span.token.toLowerCase(),
    );
    const ans = linkedQ ? answerByQuestionId.get(linkedQ.id) : undefined;
    return {
      token: span.token,
      kind: `${span.category} Ambiguity`,
      reason: span.reason,
      resolved: Boolean(ans),
      resolvedValue: ans?.resolvedValue,
    };
  });

  const missingContext = verificationReport.fieldChecks
    .filter((c) => c.status !== "Passed")
    .map(
      (c) =>
        `${c.field}${c.required ? " (Required)" : " (Optional)"}: ${c.targetToken ?? c.explanation}`,
    );

  const requiredUnpassedCount =
    verificationReport.requiredTotal - verificationReport.requiredPassed;
  const wordCount = analysis.prompt.trim().split(/\s+/).filter(Boolean).length;

  const supWeight = supportingEvidence.reduce((s, e) => s + e.impactWeight, 0);
  const conWeight = contradictingEvidence.reduce((s, e) => s + e.impactWeight, 0);
  const evidenceSufficiencyScore = Number(
    clamp(
      supWeight +
        validAnswers.length * 0.14 -
        requiredUnpassedCount * 0.1 -
        contradictingEvidence.length * 0.12,
      0,
      1,
    ).toFixed(4),
  );

  // 4. Abstention detection: insufficient evidence or contradictions
  const hasRealContradiction = contradictingEvidence.some(
    (c) =>
      c.category === "Verification Contradiction" ||
      c.category === "Directive Conflict" ||
      c.category === "Unresolved Selection",
  );
  const multiContradictions =
    contradictingEvidence.filter((c) => c.category !== "Competing Hypotheses").length >= 2;
  const insufficientEvidence =
    validAnswers.length === 0 &&
    ((wordCount <= 9 &&
      uniqueAnchors.length === 0 &&
      analysis.ambiguityScore >= 82 &&
      requiredUnpassedCount >= 2) ||
      (analysis.interpretations.length >= 2 &&
        Math.abs(
          (analysis.interpretations[0]?.probability ?? 50) -
            (analysis.interpretations[1]?.probability ?? 50),
        ) <= 6 &&
        uniqueAnchors.length === 0 &&
        requiredUnpassedCount >= 2));

  let abstentionReason: string | null = null;
  if (hasRealContradiction || multiContradictions) {
    const firstContra = contradictingEvidence[0];
    abstentionReason = `Contradictory directives or answers detected (${firstContra?.label ?? "slot conflict"}). Abstaining instead of guessing an arbitrary resolution.`;
  } else if (insufficientEvidence) {
    abstentionReason =
      "Insufficient disambiguating context and zero concrete entity anchors detected across competing interpretations. Abstaining until clarification supplies missing constraints.";
  }

  const abstained = abstentionReason !== null;

  let confidenceScore: number | null = null;
  if (!abstained) {
    const baseFromClarity = optimizerState.currentClarityScore / 100;
    const adjusted = baseFromClarity * 0.72 + supWeight * 0.45 - conWeight * 0.42;
    const bounded = clamp(adjusted, 0.18, verificationReport.allRequiredPassed ? 0.94 : 0.74);
    confidenceScore = Number(bounded.toFixed(4));
  }

  const confidenceBand = bandFromScore(confidenceScore, abstained);
  const uncertaintyScore = abstained
    ? 1
    : Number(Math.max(0.06, 1 - (confidenceScore ?? 0)).toFixed(4));

  let verifiedCorrectness: VerifiedCorrectnessState = "unverified";
  let verificationExplanation =
    "Unverified — candidate interpretation likelihood must not be confused with verified intent correctness until all required checks pass.";

  if (hasRealContradiction) {
    verifiedCorrectness = "contradictory";
    verificationExplanation =
      "Contradictory — conflicting requirements prevent verified resolution even if an option looks superficially plausible.";
  } else if (verificationReport.allRequiredPassed && !abstained) {
    verifiedCorrectness = "verified";
    verificationExplanation = `Verified — all ${verificationReport.requiredTotal}/${verificationReport.requiredTotal} required checks passed without contradictions.`;
  } else if (validAnswers.length > 0 && verificationReport.requiredPassed > 0 && !abstained) {
    verifiedCorrectness = "partially_verified";
    verificationExplanation = `Partially verified — ${verificationReport.requiredPassed}/${verificationReport.requiredTotal} required fields verified; remaining required context still needed.`;
  }

  // 5. Turn-by-turn Confidence History + Delta Explanation
  const t1RawSup =
    (uniqueAnchors.length > 0 ? 0.2 : 0) + (analysis.domain !== "General" ? 0.12 : 0);
  const t1Abstain =
    insufficientEvidence ||
    INLINE_CONTRADICTION_PAIRS.some((pair) => {
      const lowerPrompt = analysis.prompt.toLowerCase();
      return (
        pair.a.some((t) => lowerPrompt.includes(t)) && pair.b.some((t) => lowerPrompt.includes(t))
      );
    });
  const t1Score = t1Abstain
    ? null
    : Number(clamp((analysis.clarityScore / 100) * 0.68 + t1RawSup * 0.5, 0.16, 0.68).toFixed(4));

  const history: ConfidenceHistoryPoint[] = [
    {
      turnNumber: 1,
      timestamp: analysis.createdAt,
      eventLabel: "Initial Prompt Analysis",
      triggerInput: analysis.prompt.slice(0, 140),
      confidenceScore: t1Score,
      confidenceBand: bandFromScore(t1Score, t1Abstain),
      verifiedCorrectness:
        t1Abstain && hasRealContradiction && validAnswers.length === 0
          ? "contradictory"
          : "unverified",
      abstained: t1Abstain,
      deltaFromPrevious: null,
      changeReasons: t1Abstain
        ? [
            hasRealContradiction && validAnswers.length === 0
              ? "Initial prompt contains self-contradictory directives."
              : "Too few entity anchors and high multi-branch entropy; abstained initially.",
          ]
        : [
            `Detected ${analysis.spans.length} ambiguity span(s) and ${analysis.interpretations.length} competing interpretations.`,
            uniqueAnchors.length > 0
              ? `Found ${uniqueAnchors.length} grounding anchor(s).`
              : "No concrete IDs/dates detected yet.",
          ],
      changeSummary: t1Abstain
        ? "Turn 1 abstained — refused to guess without disambiguating evidence."
        : `Turn 1 calibrated at ${Math.round((t1Score ?? 0) * 100)}% (${analysis.spans.length} open ambiguities, Unverified).`,
      evidenceCountSupporting: uniqueAnchors.length > 0 ? 2 : 1,
      evidenceCountContradicting: t1Abstain ? 1 : 0,
    },
  ];

  let prevScore = t1Score;
  let prevAbstained = t1Abstain;
  validAnswers.forEach((ans, idx) => {
    const turnNum = idx + 2;
    const isContradictoryTurn =
      INDECISION_REGEX.test(ans.resolvedValue) ||
      verificationReport.contradictions.some(
        (c) =>
          c.targetQuestionId === ans.questionId ||
          c.fields.includes(ans.essentialField ?? "Action Scope"),
      );
    const isLastTurn = idx === validAnswers.length - 1;
    const clarityFrac = (ans.clarityAfter ?? optimizerState.currentClarityScore) / 100;
    const stepAbstain = isLastTurn ? abstained : isContradictoryTurn;
    const stepScore = stepAbstain
      ? null
      : isLastTurn
        ? confidenceScore
        : Number(clamp(clarityFrac * 0.78 + 0.1, 0.24, 0.88).toFixed(4));

    const delta =
      stepScore !== null && prevScore !== null ? Number((stepScore - prevScore).toFixed(4)) : null;

    const reasons: string[] = [];
    if (stepAbstain) {
      reasons.push(
        isContradictoryTurn
          ? `Turn conflicted with constraints on “${ans.targetToken ?? ans.essentialField ?? "scope"}” — engine abstained.`
          : "Insufficient verified evidence after turn — abstained.",
      );
    } else if (prevAbstained && stepScore !== null) {
      reasons.push(
        `Recovered from abstention to ${Math.round(stepScore * 100)}% after clarifying “${ans.targetToken ?? ans.essentialField ?? "field"}” → ${ans.resolvedValue}.`,
      );
    } else if (delta !== null && delta > 0) {
      reasons.push(
        `+${Math.round(delta * 100)} pts from clarifying “${ans.targetToken ?? ans.essentialField ?? "field"}” → ${ans.resolvedValue}.`,
      );
    } else if (delta !== null && delta < 0) {
      reasons.push(`${Math.round(delta * 100)} pts due to new tension or incomplete constraint.`);
    } else {
      reasons.push(`Clarified “${ans.targetToken ?? "constraint"}” → ${ans.resolvedValue}.`);
    }

    if (isLastTurn && verifiedCorrectness === "verified") {
      reasons.push("All required verification checks passed.");
    }

    history.push({
      turnNumber: turnNum,
      timestamp: ans.answeredAt ?? new Date().toISOString(),
      eventLabel:
        isLastTurn && verifiedCorrectness === "verified"
          ? "Verified Resolution Reached"
          : `Clarification Turn ${idx + 1}: ${ans.targetToken ?? ans.essentialField ?? "Slot"}`,
      triggerInput: ans.resolvedValue,
      confidenceScore: stepScore,
      confidenceBand: bandFromScore(stepScore, stepAbstain),
      verifiedCorrectness: isLastTurn
        ? verifiedCorrectness
        : isContradictoryTurn
          ? "contradictory"
          : "partially_verified",
      abstained: stepAbstain,
      deltaFromPrevious: delta,
      changeReasons: reasons,
      changeSummary: reasons.join(" "),
      evidenceCountSupporting: supportingEvidence.length,
      evidenceCountContradicting: stepAbstain ? contradictingEvidence.length : 0,
    });

    prevScore = stepScore;
    prevAbstained = stepAbstain;
  });

  // Include active What-If selection context note
  const calibrationNote =
    selectedInterpretation && !abstained
      ? `CLIENT SIMULATION (DEMO DATA — NOT LIVE MODEL OUTPUT): Derived from local verification checks, anchor detection, and active scenario “${selectedInterpretation.title}”. Connect FastAPI backend in Settings for live backend calibration.`
      : "CLIENT SIMULATION (DEMO DATA — NOT LIVE MODEL OUTPUT): Scores reflect deterministic heuristic checks and abstain whenever evidence is contradictory or insufficient.";

  const recommendedAction: ConfidenceAssessment["recommendedAction"] =
    verifiedCorrectness === "contradictory"
      ? "resolve_conflicts"
      : abstained || verifiedCorrectness !== "verified"
        ? "request_clarification"
        : "proceed_verified";

  const recommendationReason =
    recommendedAction === "resolve_conflicts"
      ? "Conflicting constraints detected — request clarification to resolve contradictions instead of forcing any interpretation."
      : recommendedAction === "request_clarification"
        ? "Uncertainty or missing required context remains — ask targeted clarification instead of guessing an unverified interpretation."
        : "All required checks verified with calibrated confidence and zero contradictions.";

  return {
    provenance: "client_simulation",
    isLiveBackend: false,
    modelConfidenceAvailable: false,
    confidenceBasis: abstained ? "insufficient_evidence_abstained" : "client_simulation_calibrated",
    confidenceScore,
    confidenceBand,
    uncertaintyScore,
    evidenceSufficiencyScore,
    verifiedCorrectness,
    verificationExplanation,
    abstained,
    abstentionReason,
    recommendedAction,
    recommendationReason,
    supportingEvidence,
    contradictingEvidence,
    missingContext,
    unresolvedEntities,
    history,
    calibrationNote,
  };
}

export function enrichInterpretationsWithConfidence(
  interpretations: Interpretation[],
  assessment: ConfidenceAssessment,
  clarificationAnswers: ClarificationAnswer[],
): Interpretation[] {
  const answerText = clarificationAnswers.map((a) => a.resolvedValue.toLowerCase()).join(" ");
  return interpretations.map((interp) => {
    // Preserve live backend calibration if already computed through the current turn
    if (
      assessment.isLiveBackend &&
      assessment.history.length >= clarificationAnswers.length + 1 &&
      interp.confidenceStatus !== undefined
    ) {
      return interp;
    }

    const keywords = interp.title
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 4);
    const matchedClarify = keywords.filter((kw) => answerText.includes(kw));

    const supportingSignals: string[] = [
      ...(interp.supportingSignals ?? []),
      ...(matchedClarify.length > 0
        ? [`Aligned with clarification terms (${matchedClarify.join(", ")})`]
        : []),
      ...interp.assumptions.slice(0, 1).map((a) => `Assumption: ${a}`),
    ];

    const contradictingSignals: string[] = [
      ...(interp.contradictingSignals ?? []),
      ...assessment.contradictingEvidence
        .filter((c) => c.category !== "Competing Hypotheses")
        .slice(0, 2)
        .map((c) => c.label),
    ];

    const missingRequirements =
      interp.missingRequirements && interp.missingRequirements.length > 0
        ? interp.missingRequirements
        : assessment.missingContext.slice(0, 2);

    if (assessment.abstained) {
      return {
        ...interp,
        confidenceScore: null,
        confidenceStatus: "abstained",
        supportingSignals: [...new Set(supportingSignals)],
        contradictingSignals: [...new Set(contradictingSignals)],
        missingRequirements,
      };
    }

    const boost = matchedClarify.length * 0.14;
    const raw = (interp.probability / 100) * 0.85 + boost;
    const calibrated = Number(clamp(raw, 0.08, 0.94).toFixed(4));

    return {
      ...interp,
      confidenceScore: calibrated,
      confidenceStatus: "calibrated",
      supportingSignals: [...new Set(supportingSignals)],
      contradictingSignals: [...new Set(contradictingSignals)],
      missingRequirements,
    };
  });
}
