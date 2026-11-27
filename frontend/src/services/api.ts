import { ENV_CONFIG } from "@/config/env";
import {
  analyzeCustomPromptMock,
  buildContextIntelligenceGraph,
  computeClarificationOptimizerState,
  computeInterpretationDiffs,
  computeResolutionFromInputs,
  computeResolutionVerification,
  DEMO_EVALUATION_DATA,
} from "@/data/mockData";
import type {
  AnalysisResult,
  AnalyzePromptRequest,
  BackendHealthStatus,
  ClarificationAnswer,
  ClarificationOptimizerState,
  ContextIntelligenceGraphData,
  EvaluationDataset,
  FinalResolution,
  Interpretation,
  ResolutionVerificationReport,
  ResolveIntentRequest,
  ScenarioDimensionDiff,
} from "@/types/resolvex";

export const API_ENDPOINTS = {
  health: "/health",
  analyze: "/api/v1/analyze",
  resolve: "/api/v1/resolve",
  evaluation: "/api/v1/evaluation",
} as const;

export class ApiServiceError extends Error {
  status?: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiServiceError";
    this.status = status;
  }
}

/**
 * Future FastAPI HTTP helper — ready to activate when a FastAPI backend is running.
 * Currently unused at runtime because ResolveX runs strictly in client-side mock mode.
 */
export async function requestFastApi<TResponse>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  const normalizedBase = baseUrl.replace(/\/+$/, "") || ENV_CONFIG.apiBaseUrl;
  const response = await fetch(`${normalizedBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new ApiServiceError(`FastAPI request failed (${response.status})`, response.status);
  }

  return (await response.json()) as TResponse;
}

export const resolveXService = {
  getEndpointUrl(baseUrl: string, endpoint: keyof typeof API_ENDPOINTS): string {
    const cleanBase = baseUrl.replace(/\/+$/, "") || ENV_CONFIG.apiBaseUrl;
    return `${cleanBase}${API_ENDPOINTS[endpoint]}`;
  },

  async analyzePrompt(payload: AnalyzePromptRequest): Promise<AnalysisResult> {
    const trimmed = payload.prompt.trim();
    if (!trimmed) {
      throw new ApiServiceError("Prompt cannot be empty.");
    }

    return analyzeCustomPromptMock(
      trimmed,
      payload.domain,
      payload.strictness,
      payload.maxQuestions ?? 3,
      payload.language ?? "Auto Detect",
    );
  },

  evaluateClarificationState(
    analysis: AnalysisResult,
    answers: ClarificationAnswer[],
    ambiguityThreshold: number,
    allowOptionalRefinement = false,
    selectedInterpretation: Interpretation | null = null,
  ): ClarificationOptimizerState {
    return computeClarificationOptimizerState(
      analysis,
      answers,
      ambiguityThreshold,
      allowOptionalRefinement,
      selectedInterpretation,
    );
  },

  verifyResolutionReadiness(
    analysis: AnalysisResult,
    answers: ClarificationAnswer[],
    selectedInterpretation: Interpretation | null = null,
  ): ResolutionVerificationReport {
    return computeResolutionVerification(analysis, answers, selectedInterpretation);
  },

  buildContextGraph(
    analysis: AnalysisResult,
    answers: ClarificationAnswer[],
    selectedInterpretation: Interpretation | null,
    optimizerState: ClarificationOptimizerState,
  ): ContextIntelligenceGraphData {
    return buildContextIntelligenceGraph(analysis, answers, selectedInterpretation, optimizerState);
  },

  simulateInterpretationDiffs(interpretations: Interpretation[]): ScenarioDimensionDiff[] {
    return computeInterpretationDiffs(interpretations);
  },

  async resolveIntent(
    analysis: AnalysisResult,
    request: ResolveIntentRequest,
    selectedInterpretation: Interpretation | null,
    ambiguityThreshold = 60,
  ): Promise<FinalResolution> {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const optimizerState = computeClarificationOptimizerState(
      analysis,
      request.answers,
      ambiguityThreshold,
      false,
      selectedInterpretation,
    );

    const verification = computeResolutionVerification(
      analysis,
      request.answers,
      selectedInterpretation,
    );

    const baseResolution = computeResolutionFromInputs(
      request.prompt,
      analysis.spans,
      selectedInterpretation,
      request.answers,
      analysis.domain,
      analysis.clarificationQuestions,
    );

    const remainingAmbiguityScore = optimizerState.remainingAmbiguityScore;
    const clarityGain = Math.max(0, optimizerState.currentClarityScore - analysis.clarityScore);

    return {
      ...baseResolution,
      clarityGain,
      remainingAmbiguityScore,
      structuredSpec: {
        ...baseResolution.structuredSpec,
        confidenceAfterClarification: 100 - remainingAmbiguityScore,
      },
      optimizationSummary: {
        turnsTaken: optimizerState.conversationHistory.length,
        totalQuestionsAvailable: analysis.clarificationQuestions.length,
        skippedOptionalCount: optimizerState.skippedOptionalCount,
        stoppedEarly: optimizerState.isSufficientlyClear && optimizerState.skippedOptionalCount > 0,
        stopReason: optimizerState.stopReason,
        essentialFields: optimizerState.essentialFields,
      },
      verification,
    };
  },

  async getEvaluationDataset(): Promise<EvaluationDataset> {
    return DEMO_EVALUATION_DATA;
  },

  async previewBackendConnection(
    baseUrl: string,
    mode: "mock" | "fastapi-ready",
  ): Promise<BackendHealthStatus> {
    const cleanBase = baseUrl.replace(/\/+$/, "") || ENV_CONFIG.apiBaseUrl;
    return {
      reachable: false,
      mode,
      baseUrl: cleanBase,
      checkedAt: new Date().toISOString(),
      message:
        mode === "mock"
          ? "Mock engine active (no backend requests sent). FastAPI client contracts are ready."
          : `FastAPI target configured at ${cleanBase}${API_ENDPOINTS.health}. Running local mock fallback until backend is connected.`,
    };
  },
};
