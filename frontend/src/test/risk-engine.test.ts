import { describe, expect, it } from "vitest";
import { evaluateClientIntentRisk, syncRiskWithContextGraph } from "@/data/riskEngine";
import {
  buildPresetAnalysis,
  computeClarificationOptimizerState,
  computeResolutionVerification,
} from "@/data/mockData";
import type { BackendRiskAssessmentDTO, ClarificationAnswer } from "@/types/resolvex";

describe("Feature 9: Risk-Aware Intent Resolution (Frontend)", () => {
  it("classifies low risk for read-only informational directives", () => {
    const assessment = evaluateClientIntentRisk({
      prompt: "Show me the quarterly documentation report for Q3.",
      action: "view_report",
      target: "Q3 documentation",
    });

    expect(assessment.riskLevel).toBe("Low");
    expect(assessment.requiresExplicitConfirmation).toBe(false);
    expect(assessment.safeToResolve).toBe(true);
    expect(assessment.reversibility).toBe("reversible");
    expect(assessment.highImpactAmbiguities).toHaveLength(0);
  });

  it("detects high-impact deletion and requires explicit confirmation", () => {
    const assessment = evaluateClientIntentRisk({
      prompt: "Drop all unused tables and delete the production database cluster.",
      action: "delete_database",
      target: "production database cluster",
      userConfirmed: false,
    });

    expect(assessment.riskLevel).toBe("High");
    expect(assessment.requiresExplicitConfirmation).toBe(true);
    expect(assessment.safeToResolve).toBe(false);
    expect(assessment.reversibility).toBe("irreversible");
    expect(
      assessment.highImpactAmbiguities.some((amb) => amb.toLowerCase().includes("deletion")),
    ).toBe(true);
    expect(assessment.confirmationReason).toContain("Explicit confirmation is required");

    // Once user confirms explicitly
    const confirmed = evaluateClientIntentRisk({
      prompt: "Drop all unused tables and delete the production database cluster.",
      action: "delete_database",
      target: "production database cluster",
      userConfirmed: true,
      verificationReport: {
        status: "Verified",
        allRequiredPassed: true,
        completenessScore: 100,
        completenessExplanation: "All verified",
        requiredTotal: 2,
        requiredPassed: 2,
        optionalTotal: 0,
        optionalPassed: 0,
        missingFields: [],
        ambiguousFields: [],
        contradictoryFields: [],
        contradictions: [],
        fieldChecks: [],
        checkedAt: new Date().toISOString(),
      },
    });
    expect(confirmed.safeToResolve).toBe(true);
  });

  it("detects high-impact financial payment and recalculates after clarification", () => {
    // Unresolved financial payment
    const turn1 = evaluateClientIntentRisk({
      prompt: "Wire some money for the vendor invoice.",
      action: "wire_funds",
      target: "vendor invoice",
      answers: [],
      userConfirmed: false,
    });

    expect(turn1.riskLevel).toBe("High");
    expect(turn1.requiresExplicitConfirmation).toBe(true);
    expect(turn1.safeToResolve).toBe(false);
    expect(turn1.highImpactAmbiguities.some((amb) => amb.toLowerCase().includes("financial"))).toBe(
      true,
    );

    // Turn 2 with clarification answer pinning recipient and amount
    const clarifyAnswer: ClarificationAnswer = {
      questionId: "q-vendor",
      selectedOptionId: "opt-1",
      customAnswer: "Pay $5,000 USD to Acme Corp for INV-902",
      resolvedValue: "Pay $5,000 USD to Acme Corp for INV-902",
      turnNumber: 1,
    };
    const turn2 = evaluateClientIntentRisk({
      prompt: "Wire some money for the vendor invoice.",
      action: "wire_funds",
      target: "INV-902 for $5,000 USD",
      answers: [clarifyAnswer],
      userConfirmed: true,
    });

    expect(turn2.requiresExplicitConfirmation).toBe(true);
    expect(turn2.safeToResolve).toBe(true);
  });

  it("detects permission elevation and broad public reach", () => {
    const assessment = evaluateClientIntentRisk({
      prompt: "Grant admin privileges to everyone and broadcast to all employees.",
      action: "grant_admin",
      target: "all employees",
    });

    expect(assessment.riskLevel).toBe("High");
    expect(assessment.requiresExplicitConfirmation).toBe(true);
    const dimensions = assessment.riskFactors.map((f) => f.dimension);
    expect(dimensions).toContain("permission_access");
    expect(dimensions).toContain("sensitive_recipient");
  });

  it("respects honest backend risk assessment DTO when available", () => {
    const backendDTO: BackendRiskAssessmentDTO = {
      risk_level: "High",
      risk_score: 88,
      requires_explicit_confirmation: true,
      confirmation_reason: "Contains destructive deletion on live resources.",
      high_impact_ambiguities: ["Ambiguous production table scope"],
      risk_factors: [
        {
          dimension: "data_deletion",
          level: "High",
          label: "Destructive Resource Deletion",
          description: "Deletes records from live database.",
          requires_confirmation: true,
        },
      ],
      action_type: "purge_database",
      target_summary: "Production User Store",
      reversibility: "irreversible",
      mitigation_guidance: "Require two-person confirmation.",
      safe_to_resolve: false,
    };

    const assessment = evaluateClientIntentRisk({
      prompt: "Purge user store.",
      backendAssessment: backendDTO,
      userConfirmed: false,
    });

    expect(assessment.riskLevel).toBe("High");
    expect(assessment.riskScore).toBe(88);
    expect(assessment.requiresExplicitConfirmation).toBe(true);
    expect(assessment.safeToResolve).toBe(false);
  });
});
