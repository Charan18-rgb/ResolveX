import type {
  AmbiguitySpan,
  AnalysisResult,
  BackendRiskAssessmentDTO,
  ClarificationAnswer,
  ContextIntelligenceGraphData,
  ImpactDimension,
  IntentRiskAssessment,
  Interpretation,
  ResolutionVerificationReport,
  RiskFactor,
  RiskLevel,
} from "@/types/resolvex";

const PAYMENT_REGEX =
  /\b(?:pay|payment|transfer|wire|refund|charge|invoice|disburse|payout|settle|remit|\$|usd|inr|eur|credit\s*card|bank\s*account)\b/i;
const DELETION_REGEX =
  /\b(?:delete|drop|purge|truncate|destroy|remove|wipe|erase|terminate|cancel|revoke|tear\s*down)\b/i;
const PERMISSION_REGEX =
  /\b(?:grant|elevate|admin|root|superuser|sudo|iam|role|privilege|access|unrestricted|bypass|permission|policy|auth\s*rule)\b/i;
const SENSITIVE_RECIPIENT_REGEX =
  /\b(?:all\s*employees|everyone|company-wide|public|external|all\s*customers|all\s*users|board|executives|investor|auditor|regulator|legal|press|journalist)\b/i;
const HIGH_MUTATION_REGEX =
  /\b(?:deploy|push\s*to\s*prod|publish|broadcast|reallocate|bulk\s*update|override)\b/i;

export function evaluateClientIntentRisk(params: {
  action?: string | undefined;
  target?: string | undefined;
  prompt: string;
  answers?: ClarificationAnswer[] | undefined;
  verificationReport?: ResolutionVerificationReport | undefined;
  selectedInterpretation?: Interpretation | null | undefined;
  userConfirmed?: boolean | undefined;
  backendAssessment?: BackendRiskAssessmentDTO | null | undefined;
}): IntentRiskAssessment {
  const {
    action = "execute_instruction",
    target,
    prompt,
    answers = [],
    verificationReport,
    selectedInterpretation,
    userConfirmed = false,
    backendAssessment,
  } = params;

  // If backend provided an honest risk assessment, use it as baseline
  if (backendAssessment) {
    const isSafe =
      backendAssessment.safe_to_resolve &&
      (!backendAssessment.requires_explicit_confirmation || userConfirmed);

    return {
      riskLevel: backendAssessment.risk_level,
      riskScore: backendAssessment.risk_score,
      requiresExplicitConfirmation: backendAssessment.requires_explicit_confirmation,
      confirmationReason: backendAssessment.confirmation_reason,
      highImpactAmbiguities: backendAssessment.high_impact_ambiguities,
      riskFactors: backendAssessment.risk_factors.map((f) => ({
        dimension: f.dimension,
        level: f.level,
        label: f.label,
        description: f.description,
        targetToken: f.target_token ?? undefined,
        requiresConfirmation: f.requires_confirmation ?? false,
      })),
      actionType: backendAssessment.action_type,
      targetSummary: target ?? backendAssessment.target_summary,
      reversibility: backendAssessment.reversibility,
      mitigationGuidance: backendAssessment.mitigation_guidance,
      safeToResolve: isSafe,
      confirmedByUser: userConfirmed,
    };
  }

  // Client Simulation Engine (DEMO DATA — NOT live backend output)
  const answerTexts = answers.map((a) => a.resolvedValue).join(" ");
  const combinedText =
    `${action} ${target ?? ""} ${prompt} ${answerTexts} ${selectedInterpretation?.title ?? ""}`.toLowerCase();

  const factors: RiskFactor[] = [];
  const highImpactAmbiguities: string[] = [];

  const unpassedRequired = verificationReport
    ? verificationReport.requiredTotal - verificationReport.requiredPassed
    : answers.length > 0
      ? 0
      : 1;

  // 1. Financial / Payment Dimension
  if (PAYMENT_REGEX.test(combinedText)) {
    const hasVagueFinance = /\b(?:some\s+money|funds|balance|bonus|amount|budget|invoice)\b/i.test(
      combinedText,
    );
    const hasUnresolvedRecipient = answers.every(
      (a) => !/\b(?:inv-\d+|\$\d+|acme|vendor|rahul|priya|ananya)\b/i.test(a.resolvedValue),
    );
    const isAmbiguous = (hasVagueFinance && hasUnresolvedRecipient) || unpassedRequired > 0;
    const level: RiskLevel = isAmbiguous ? "High" : "Moderate";

    factors.push({
      dimension: "financial_payment",
      level,
      label: "Financial Transaction & Disbursement",
      description:
        "Instruction initiates fund transfer, invoice settlement, or balance reallocation.",
      targetToken: "payment",
      requiresConfirmation: true,
    });
    if (isAmbiguous) {
      highImpactAmbiguities.push("Unverified financial recipient, amount, or budget schedule");
    }
  }

  // 2. Data Deletion / Destruction Dimension
  if (DELETION_REGEX.test(combinedText)) {
    const isBroad = /\b(?:all|everything|prod|production|cluster|database|tables|records)\b/i.test(
      combinedText,
    );
    factors.push({
      dimension: "data_deletion",
      level: "High",
      label: "Destructive Resource Deletion",
      description:
        "Permanent removal, table drop, or cluster tear-down with irreversible consequence.",
      targetToken: "delete",
      requiresConfirmation: true,
    });
    if (isBroad || unpassedRequired > 0) {
      highImpactAmbiguities.push("Destructive deletion with broad or unconstrained blast radius");
    }
  }

  // 3. Permission & IAM Access Dimension
  if (PERMISSION_REGEX.test(combinedText)) {
    const isAdmin = /\b(?:admin|root|superuser|sudo|unrestricted)\b/i.test(combinedText);
    const level: RiskLevel = isAdmin ? "High" : "Moderate";
    factors.push({
      dimension: "permission_access",
      level,
      label: "Security Privilege & Access Elevation",
      description:
        "Modifies IAM role, bypasses authentication guardrails, or grants administrative rights.",
      targetToken: "permission",
      requiresConfirmation: level === "High",
    });
    if (isAdmin || unpassedRequired > 0) {
      highImpactAmbiguities.push("Ambiguous security boundary or unverified administrative scope");
    }
  }

  // 4. Sensitive Recipient & Public Exposure Dimension
  if (SENSITIVE_RECIPIENT_REGEX.test(combinedText)) {
    factors.push({
      dimension: "sensitive_recipient",
      level: "High",
      label: "Broad / Sensitive Audience Reach",
      description:
        "Distributes communication to all employees, executives, regulators, or external press.",
      targetToken: "recipient",
      requiresConfirmation: true,
    });
    if (unpassedRequired > 0) {
      highImpactAmbiguities.push(
        "Broad distribution list lacking verified recipient authentication",
      );
    }
  }

  // 5. System Mutation / Production Deploy
  if (HIGH_MUTATION_REGEX.test(combinedText)) {
    const isProd = /\b(?:prod|production|live)\b/i.test(combinedText);
    const level: RiskLevel = isProd ? "High" : "Moderate";
    factors.push({
      dimension: "system_mutation",
      level,
      label: "Production Environment Mutation",
      description: "Mutates live production resources, reallocates stock, or updates state.",
      targetToken: "mutation",
      requiresConfirmation: level === "High",
    });
    if (isProd && unpassedRequired > 0) {
      highImpactAmbiguities.push("Production mutation with unresolved execution constraints");
    }
  }

  // Overall level & score
  let baseScore = 15;
  if (factors.some((f) => f.level === "High")) {
    baseScore = 75;
  } else if (factors.some((f) => f.level === "Moderate")) {
    baseScore = 45;
  } else if (factors.length > 0) {
    baseScore = 30;
  }

  const penalty = Math.min(20, unpassedRequired * 8);
  const riskScore = Math.min(100, baseScore + penalty);

  let overallLevel: RiskLevel = "Low";
  if (
    riskScore >= 65 ||
    factors.some((f) => f.level === "High") ||
    highImpactAmbiguities.length > 0
  ) {
    overallLevel = "High";
  } else if (riskScore >= 35 || factors.length > 0) {
    overallLevel = "Moderate";
  }

  // Reversibility
  let reversibility: "reversible" | "partially_reversible" | "irreversible" = "reversible";
  if (DELETION_REGEX.test(combinedText) || /\b(?:purge|truncate|wire)\b/i.test(combinedText)) {
    reversibility = "irreversible";
  } else if (
    PAYMENT_REGEX.test(combinedText) ||
    PERMISSION_REGEX.test(combinedText) ||
    HIGH_MUTATION_REGEX.test(combinedText)
  ) {
    reversibility = "partially_reversible";
  }

  const requiresExplicitConfirmation =
    overallLevel === "High" ||
    factors.some((f) => f.requiresConfirmation) ||
    highImpactAmbiguities.length > 0;

  let confirmationReason: string | null = null;
  if (requiresExplicitConfirmation) {
    const parts: string[] = [];
    if (highImpactAmbiguities.length > 0) {
      parts.push(`High-impact ambiguity detected: ${highImpactAmbiguities.join("; ")}`);
    }
    const criticalFactors = factors.filter((f) => f.requiresConfirmation).map((f) => f.label);
    if (criticalFactors.length > 0) {
      parts.push(`Critical impact areas (${criticalFactors.join(", ")})`);
    }
    confirmationReason = `${parts.join(" | ")}. Explicit confirmation is required before this intent can be marked safe to resolve.`;
  }

  // Safe to resolve check
  let safeToResolve = true;
  if (overallLevel === "High") {
    if (highImpactAmbiguities.length > 0 && !userConfirmed) {
      safeToResolve = false;
    } else if (unpassedRequired > 0) {
      safeToResolve = false;
    } else if (requiresExplicitConfirmation && !userConfirmed) {
      safeToResolve = false;
    }
  }

  const mitigationGuidance =
    overallLevel === "High"
      ? "High-risk operation: Review target scope, verify exact recipients and financial/access boundaries, and require explicit human confirmation. ResolveX never executes external actions."
      : overallLevel === "Moderate"
        ? "Moderate-risk operation: Confirm parameters and verify acceptance criteria before concluding."
        : "Low-risk informational or reversible operation with minimal blast radius.";

  return {
    riskLevel: overallLevel,
    riskScore,
    requiresExplicitConfirmation,
    confirmationReason,
    highImpactAmbiguities,
    riskFactors: factors,
    actionType:
      action ||
      (DELETION_REGEX.test(combinedText)
        ? "destructive_action"
        : HIGH_MUTATION_REGEX.test(combinedText)
          ? "system_mutation"
          : "query"),
    targetSummary: target ?? (prompt.length > 60 ? `${prompt.slice(0, 58)}…` : prompt),
    reversibility,
    mitigationGuidance,
    safeToResolve,
    confirmedByUser: userConfirmed,
  };
}

export function syncRiskWithContextGraph(
  graph: ContextIntelligenceGraphData,
  riskAssessment: IntentRiskAssessment,
): ContextIntelligenceGraphData {
  if (!riskAssessment) return graph;

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const isHighImpact = riskAssessment.riskFactors.some(
        (f) =>
          f.level === "High" &&
          (node.kind === "action" ||
            node.label.toLowerCase().includes(f.dimension.split("_")[0] ?? "")),
      );

      return {
        ...node,
        riskLevel: isHighImpact ? ("High" as RiskLevel) : node.riskLevel,
        uncertaintyReason:
          isHighImpact && !riskAssessment.safeToResolve
            ? `${node.uncertaintyReason} [High-Risk: ${riskAssessment.confirmationReason ?? "Requires explicit confirmation"}]`
            : node.uncertaintyReason,
      };
    }),
  };
}
